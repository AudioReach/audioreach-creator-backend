/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfTuningConfigService,
  CkvReadModel,
  TkvReadModel,
  TagReadModel,
  CkvParamReadModel,
  KeyValueDefQueryService,
  TagDefinitionQueryService,
  ConfigurationIncludes,
  KeyValuePairReadModel,
  Issue,
  TagDefinitionReadModel,
} from '@arc/core';
import {
  Result,
  ERROR_CODES,
  CONFIGURATION_INCLUDES,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  CkvOverlayFetcher,
  type OverlaidCkv,
  type OverlaidCkvParameterPayload,
} from '../../fetchers/ckv-overlay-fetcher.js';
import {
  TkvOverlayFetcher,
  type OverlaidModuleTagIdMap,
  type OverlaidTkv,
} from '../../fetchers/tkv-overlay-fetcher.js';
import {ModuleNodeOverlayFetcher} from '../../fetchers/module-node-overlay-fetcher.js';
import {
  SpfModuleParameterDefinitionFetcher,
  type OverlaidParameterDefinition,
} from '../../fetchers/definitions/spf-module-definitions/spf-module-parameter-definition-fetcher.js';

/**
 * Database implementation of SpfTuningConfigService.
 *
 * All overlay delegated to fetchers (FR-3):
 *   ModuleNodeOverlayFetcher   — existence check for the SpfModule root
 *   CkvOverlayFetcher          — Ckv rows and CkvParameterPayload rows
 *   TkvOverlayFetcher          — ModuleTagIdMap + Tkv rows
 *   SpfModuleParameterDefinitionFetcher — parameter definitions for CkvParamReadModel
 *
 * Public methods verify the SpfModule exists (with session overlay) before
 * loading their data — a deleted or non-existent module returns ENTITY_NOT_FOUND
 * rather than an empty result (FR-8 Rule 1).
 *
 * Key-value pair resolution is cross-aggregate enrichment delegated to
 * KeyValueDefQueryService (FR-4).
 */
export class DbSpfTuningConfigService implements SpfTuningConfigService {
  private readonly ckvFetcher: CkvOverlayFetcher;
  private readonly tkvFetcher: TkvOverlayFetcher;
  private readonly moduleNodeFetcher: ModuleNodeOverlayFetcher;
  private readonly paramFetcher: SpfModuleParameterDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
    private readonly tagDefinitionSvc: TagDefinitionQueryService,
  ) {
    this.ckvFetcher = new CkvOverlayFetcher(dataSource.manager, editActionsSvc);
    this.tkvFetcher = new TkvOverlayFetcher(dataSource.manager, editActionsSvc);
    this.moduleNodeFetcher = new ModuleNodeOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.paramFetcher = new SpfModuleParameterDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  // ── Public methods ───────────────────────────────────────────────────────

  async getModuleCkvs(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CkvReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Verify the SpfModule exists with session overlay — deleted module = not found.
      const module = await this.moduleNodeFetcher.fetchOne(
        spfModuleSystemId,
        fileSystemId,
        sessionId,
      );
      if (module === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // All Ckvs for the module with session overlay applied via fetcher (FR-3).
      const overlaidRows = await this.ckvFetcher.fetchForModule(
        spfModuleSystemId,
        sessionId,
      );

      // Per CKV, resolve key-value pairs via KeyValueDefQueryService (FR-4).
      // Each CKV builds independently — failures captured per-item (FR-8 Rule 3).
      const itemErrors: Issue[] = [];
      const results = await Promise.all(
        overlaidRows.map(async row => {
          try {
            const result = await this.buildCkvReadModel(row, fileSystemId);
            if (result.kind === RESULT_KIND.Fail) {
              itemErrors.push(...result.issues);
              return null;
            }
            itemErrors.push(...(result.issues ?? []));
            return result.data;
          } catch (error) {
            itemErrors.push({
              code: ERROR_CODES.INTERNAL_ERROR,
              message: `CKV ${row.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
              severity: IssueSeverity.Error,
            });
            return null;
          }
        }),
      );

      const data = results.filter((r): r is CkvReadModel => r !== null);
      return itemErrors.length > 0
        ? Result.partial(data, itemErrors)
        : Result.ok(data);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load CKVs for module ${spfModuleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  async getModuleCkvParams(
    ckvSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<CkvParamReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Resolve the owning module so we can call the fetchers (aggregateId = moduleSystemId).
      const moduleSystemId = await this.resolveCkvModuleSystemId(ckvSystemId);
      if (moduleSystemId === null) return Result.ok([]);

      // Step 1 — overlaid payload rows via fetcher (FR-3).
      const payloads = await this.ckvFetcher.fetchPayloads(
        ckvSystemId,
        moduleSystemId,
        sessionId,
      );
      if (payloads.length === 0) return Result.ok([]);

      // Step 2 — load parameter definitions for the module's definition (FR-3).
      // resolveDefinitionSystemId returns null if the module was deleted in session.
      const defSystemId = await this.moduleNodeFetcher.getDefinitionSystemId(
        moduleSystemId,
        sessionId,
      );
      if (defSystemId === null) return Result.ok([]);

      const paramDefs = await this.paramFetcher.fetchForDefinition(
        defSystemId,
        sessionId,
      );
      const paramDefMap = new Map(paramDefs.map(d => [d.systemId, d]));

      // Step 3 — assemble CkvParamReadModel (skip payloads with missing definitions).
      const results = payloads
        .map(payload => {
          const param = paramDefMap.get(payload.parameterSystemId);
          if (!param) return null;
          return this.buildParamReadModel(payload, param, includes);
        })
        .filter((r): r is CkvParamReadModel => r !== null);

      return Result.ok(results);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load params for CKV ${ckvSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  async getModuleTags(
    spfModuleSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<TagReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Verify the SpfModule exists with session overlay — deleted module = not found.
      const module = await this.moduleNodeFetcher.fetchOne(
        spfModuleSystemId,
        fileSystemId,
        sessionId,
      );
      if (module === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `SpfModule not found for systemId=${spfModuleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      // All ModuleTagIdMap+Tkv rows with session overlay applied via fetcher (FR-3).
      const overlaidTagMaps = await this.tkvFetcher.fetchForModule(
        spfModuleSystemId,
        sessionId,
        includes,
      );

      // Load tag definitions for tagId + tagName (cross-aggregate, FR-4).
      const tagDefIds = [
        ...new Set(overlaidTagMaps.map(r => r.tagDefinitionSystemId)),
      ];
      const tagDefsResult =
        await this.tagDefinitionSvc.getTagDefinitionsBySystemIds(
          tagDefIds,
          fileSystemId,
        );
      const tagDefMap = new Map<number, TagDefinitionReadModel>(
        (tagDefsResult.kind === RESULT_KIND.Fail ? [] : tagDefsResult.data).map(
          t => [t.systemId, t],
        ),
      );

      // Per tag map, build TKV read models.
      // Per-item failures captured without blocking the rest (FR-8 Rule 3).
      const itemErrors: Issue[] = [];
      const results = await Promise.all(
        overlaidTagMaps.map(async tagMap => {
          const tagDef = tagDefMap.get(tagMap.tagDefinitionSystemId);

          const tkvResult = await this.buildTagTkvReadModels(
            tagMap,
            fileSystemId,
          );
          const tkvs =
            tkvResult.kind === RESULT_KIND.Fail ? [] : tkvResult.data;
          itemErrors.push(...(tkvResult.issues ?? []));

          return {
            systemId: tagMap.systemId,
            tagDefinitionSystemId: tagMap.tagDefinitionSystemId,
            tagId: tagDef?.tagId ?? 0,
            tagName: tagDef?.name ?? '',
            tkvs,
          } satisfies TagReadModel;
        }),
      );

      return itemErrors.length > 0
        ? Result.partial(results, itemErrors)
        : Result.ok(results);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load tags for module ${spfModuleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolves the owning SpfModule system ID from a Ckv system ID.
   * getModuleCkvParams receives ckvSystemId but fetchers require moduleSystemId.
   * Returns null when the Ckv row does not exist in the baseline.
   */
  private async resolveCkvModuleSystemId(
    ckvSystemId: number,
  ): Promise<number | null> {
    const row = (await this.dataSource
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .select('ckv.spfModuleSystemId')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as {spfModuleSystemId: number} | null;
    return row?.spfModuleSystemId ?? null;
  }

  // ── Assembly methods ─────────────────────────────────────────────────────

  private async buildCkvReadModel(
    row: OverlaidCkv,
    fileSystemId: number,
  ): Promise<Result<CkvReadModel>> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairsResult = await this.resolveKeyValuePairs(
      valueDefIds,
      fileSystemId,
    );
    if (pairsResult.kind === RESULT_KIND.Fail)
      return Result.fail<CkvReadModel>(...pairsResult.issues);

    const model: CkvReadModel = {
      systemId: row.systemId,
      keyValuePairs: pairsResult.data,
    };
    const issues = pairsResult.issues;
    return issues && issues.length > 0
      ? Result.partial(model, issues)
      : Result.ok(model);
  }

  private async buildTkvReadModel(
    row: OverlaidTkv,
    fileSystemId: number,
  ): Promise<Result<TkvReadModel>> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairsResult = await this.resolveKeyValuePairs(
      valueDefIds,
      fileSystemId,
    );
    if (pairsResult.kind === RESULT_KIND.Fail)
      return Result.fail<TkvReadModel>(...pairsResult.issues);

    const model: TkvReadModel = {
      systemId: row.systemId,
      moduleTagIdMapSystemId: row.moduleTagIdMapSystemId,
      keyValuePairs: pairsResult.data,
    };
    const issues = pairsResult.issues;
    return issues && issues.length > 0
      ? Result.partial(model, issues)
      : Result.ok(model);
  }

  /**
   * Builds TkvReadModel[] for all TKVs under one tag map.
   * Per-TKV failures captured without blocking the rest (FR-8 Rule 3).
   */
  private async buildTagTkvReadModels(
    tagMap: OverlaidModuleTagIdMap,
    fileSystemId: number,
  ): Promise<Result<TkvReadModel[]>> {
    const itemErrors: Issue[] = [];
    const results = await Promise.all(
      tagMap.tkvs.map(async tkv => {
        try {
          const result = await this.buildTkvReadModel(tkv, fileSystemId);
          if (result.kind === RESULT_KIND.Fail) {
            itemErrors.push(...result.issues);
            return null;
          }
          itemErrors.push(...(result.issues ?? []));
          return result.data;
        } catch (error) {
          itemErrors.push({
            code: ERROR_CODES.INTERNAL_ERROR,
            message: `TKV ${tkv.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
            severity: IssueSeverity.Error,
          });
          return null;
        }
      }),
    );

    const data = results.filter((t): t is TkvReadModel => t !== null);
    return itemErrors.length > 0
      ? Result.partial(data, itemErrors)
      : Result.ok(data);
  }

  /**
   * Resolves valueDefIds to {key, value} summary pairs.
   * Delegates to KeyValueDefQueryService (FR-4 + FR-6 — read model ownership).
   */
  private async resolveKeyValuePairs(
    valueDefIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyValuePairReadModel[]>> {
    const keysResult =
      await this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );
    if (keysResult.kind === RESULT_KIND.Fail)
      return Result.fail(...keysResult.issues);
    return keysResult;
  }

  /**
   * Builds CkvParamReadModel from overlaid payload + overlaid parameter definition.
   * summary:     identity fields only
   * fullDetails: all fields + optional payload bytes
   */
  private buildParamReadModel(
    payload: OverlaidCkvParameterPayload,
    param: OverlaidParameterDefinition,
    includes: ConfigurationIncludes,
  ): CkvParamReadModel {
    const base = {
      systemId: param.systemId,
      parameterId: param.paramId,
      name: param.name ?? '',
      description: param.description,
      pidType: param.pidType,
    };

    return {
      systemId: payload.systemId,
      definition:
        includes === CONFIGURATION_INCLUDES.FullDetails
          ? {
              ...base,
              elementsStructure: param.elementsStructure,
              isPersistent: param.isPersistent,
              isReadOnly: param.isReadOnly,
              maxSize: param.maxSize,
              toolPolicies: param.toolPolicies,
            }
          : base,
      ...(includes === CONFIGURATION_INCLUDES.FullDetails && payload.payload
        ? {payload: payload.payload}
        : {}),
    };
  }
}
