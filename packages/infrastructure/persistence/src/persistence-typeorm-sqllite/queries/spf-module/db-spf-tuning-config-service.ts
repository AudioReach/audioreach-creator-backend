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
  ConfigurationIncludes,
  KeyDefinitionSummaryReadModel,
  ValueDefinitionSummaryReadModel,
  Error as AppError,
} from '@arc/core';
import {Result, ERROR_CODES, CONFIGURATION_INCLUDES} from '@arc/core';
import {applyTableOverlay} from '../edit-session/overlay-utils.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ProjectSessionRow} from '../../entity-schema/index.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvParameterPayloadRow,
} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {TagDefinitionRow} from '../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';

export class DbSpfTuningConfigService implements SpfTuningConfigService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {}

  // ── Public methods ───────────────────────────────────────────────────────

  async getModuleCkvs(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CkvReadModel[]>> {
    try {
      // Step 1 — QueryBuilder: ckv + ckv_values (valueDefIds needed for key-value pairs)
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.Ckv)
        .createQueryBuilder('ckv')
        .leftJoinAndSelect('ckv.values', 'ckvVal')
        .where('ckv.spfModuleSystemId = :id', {id: spfModuleSystemId})
        .getMany()) as CkvRow[];

      // Step 2 — Overlay at module aggregate level
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidRows = session
        ? await this.overlayCkvRows(rows, spfModuleSystemId, session)
        : rows;

      // Step 3 — Per CKV, delegate key-value pairs to KeyValueDefQueryService.
      // Each CKV builds independently — a thrown exception, or a Result.fail
      // from buildCkvReadModel, is captured as an error for that CKV and
      // processing continues for the rest. If any CKV failed, the Result is
      // partial (isSuccess=true, errors non-empty) rather than dropping the
      // whole array.
      const itemErrors: AppError[] = [];
      const results = await Promise.all(
        overlaidRows.map(async row => {
          try {
            const result = await this.buildCkvReadModel(row, fileSystemId);
            if (result.isFailure) {
              itemErrors.push(...result.errors);
              return null;
            }
            itemErrors.push(...result.errors);
            return result.data;
          } catch (error) {
            itemErrors.push({
              code: ERROR_CODES.INTERNAL_ERROR,
              message: `CKV ${row.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
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
      });
    }
  }

  async getModuleCkvParams(
    ckvSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<CkvParamReadModel[]>> {
    try {
      // Step 1 — QueryBuilder: payload + param definition
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.CkvParameterPayload)
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.spfParameter', 'param')
        .where('p.ckvSystemId = :id', {id: ckvSystemId})
        .getMany()) as CkvParameterPayloadRow[];

      // Step 2 — Overlay per payload aggregate
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaid = session
        ? await this.overlayPayloadRows(
            rows,
            session,
            ENTITY_NAMES.CkvParameterPayload,
          )
        : rows;

      // Step 3 — Map based on ConfigurationIncludes
      const results = overlaid
        .filter(p => p.spfParameter)
        .map(p => this.buildParamReadModel(p, includes));

      return Result.ok(results);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load params for CKV ${ckvSystemId}`,
      });
    }
  }

  async getModuleTags(
    spfModuleSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<TagReadModel[]>> {
    try {
      // Step 1 — QueryBuilder: tkvs + tkv_values always joined; payload
      // + param definition only when fullDetails is requested
      let qb = this.dataSource
        .getRepository(ENTITY_NAMES.ModuleTagIdMap)
        .createQueryBuilder('tagMap')
        .leftJoinAndSelect('tagMap.tkvs', 'tkv')
        .leftJoinAndSelect('tkv.values', 'tkvVal')
        .where('tagMap.spfModuleSystemId = :id', {id: spfModuleSystemId});

      if (includes === CONFIGURATION_INCLUDES.FullDetails) {
        qb = qb
          .leftJoinAndSelect('tkv.payloadCollection', 'payload')
          .leftJoinAndSelect('payload.spfParameter', 'param');
      }

      const rows = (await qb.getMany()) as ModuleTagIdMapRow[];

      // Step 2 — Overlay at module aggregate level
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const overlaidRows = session
        ? await this.overlayTagMapRows(rows, spfModuleSystemId, session)
        : rows;

      // Step 3 — Load tag definitions for tagId + tagName
      const tagDefIds = [
        ...new Set(overlaidRows.map(r => r.tagDefinitionSystemId)),
      ];
      const tagDefMap = await this.loadTagDefinitions(tagDefIds);

      // Step 4 — Per tag map, build TKV read models inline.
      // buildTagTkvReadModels isolates per-TKV failures internally and
      // always resolves to a Result — its errors are merged in here.
      const itemErrors: AppError[] = [];
      const results = await Promise.all(
        overlaidRows.map(async r => {
          const tagDef = tagDefMap.get(r.tagDefinitionSystemId);

          const tkvResult = await this.buildTagTkvReadModels(
            r,
            session,
            fileSystemId,
          );
          const tkvs = tkvResult.isFailure ? [] : tkvResult.data;
          itemErrors.push(...tkvResult.errors);

          return {
            systemId: r.systemId,
            tagDefinitionSystemId: r.tagDefinitionSystemId,
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
      });
    }
  }

  // ── Overlay methods ──────────────────────────────────────────────────────

  /**
   * Overlays CKV rows at the module aggregate level.
   * One getEditActionsByAggregateId call — filters to Ckv actions.
   */
  private async overlayCkvRows(
    rows: CkvRow[],
    spfModuleSystemId: number,
    session: ProjectSessionRow,
  ): Promise<CkvRow[]> {
    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      spfModuleSystemId,
    );
    const ckvActions = actions.filter(a => a.tableName === ENTITY_NAMES.Ckv);
    return ckvActions.length > 0 ? applyToCollection(rows, ckvActions) : rows;
  }

  /**
   * Overlays ModuleTagIdMap rows at the module aggregate level.
   */
  private async overlayTagMapRows(
    rows: ModuleTagIdMapRow[],
    spfModuleSystemId: number,
    session: ProjectSessionRow,
  ): Promise<ModuleTagIdMapRow[]> {
    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      spfModuleSystemId,
    );
    const tagMapActions = actions.filter(
      a => a.tableName === ENTITY_NAMES.ModuleTagIdMap,
    );
    return tagMapActions.length > 0
      ? applyToCollection(rows, tagMapActions)
      : rows;
  }

  /**
   * Overlays all TKV rows under one tag map using a single
   * getEditActionsByAggregateId call, instead of one call per TKV.
   * Previously overlayTkvRow was called once per TKV with the same
   * moduleTagIdMapSystemId, issuing an identical query for every TKV
   * under the same tag map (N+1 for a tag with many TKVs).
   */
  private async overlayTkvRows(
    rows: TkvRow[],
    moduleTagIdMapSystemId: number,
    session: ProjectSessionRow,
  ): Promise<TkvRow[]> {
    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      moduleTagIdMapSystemId,
    );
    const tkvActions = actions.filter(a => a.tableName === ENTITY_NAMES.Tkv);
    return tkvActions.length > 0 ? applyToCollection(rows, tkvActions) : rows;
  }

  private async overlayPayloadRows(
    payloads: Array<CkvParameterPayloadRow | TkvParameterPayloadRow>,
    session: ProjectSessionRow,
    payloadTableName: string,
  ): Promise<Array<CkvParameterPayloadRow | TkvParameterPayloadRow>> {
    const results = await Promise.all(
      payloads.map(async payload => {
        const actions = await this.editActionsSvc.getEditActionsByAggregateId(
          session.sessionId,
          payload.systemId,
        );
        const overlaidPayload = applyTableOverlay(
          payload,
          actions,
          payloadTableName,
        );
        if (!overlaidPayload) return null;

        const overlaidParam = payload.spfParameter
          ? applyTableOverlay(
              payload.spfParameter,
              actions,
              ENTITY_NAMES.SpfModuleParameterDefinition,
            )
          : null;

        return {
          ...overlaidPayload,
          spfParameter: overlaidParam ?? payload.spfParameter,
        } as CkvParameterPayloadRow | TkvParameterPayloadRow;
      }),
    );
    return results.filter(Boolean) as Array<
      CkvParameterPayloadRow | TkvParameterPayloadRow
    >;
  }

  // ── Assembly methods ─────────────────────────────────────────────────────

  /**
   * Builds CkvReadModel — delegates key-value pair resolution to
   * KeyValueDefQueryService.getKeyValueDefinitionForGivenValues in one
   * batched call, instead of one getKeyValueDefinitionForGivenValue call
   * per valueDefId (N+1).
   * A valueDefId that fails to resolve is dropped from keyValuePairs and
   * surfaced as an item error via Result.partial.
   */
  private async buildCkvReadModel(
    row: CkvRow,
    fileSystemId: number,
  ): Promise<Result<CkvReadModel>> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const pairsResult = await this.resolveKeyValuePairs(
      valueDefIds,
      fileSystemId,
    );
    if (pairsResult.isFailure)
      return Result.fail<CkvReadModel>(...pairsResult.errors);

    const model: CkvReadModel = {
      systemId: row.systemId,
      keyValuePairs: pairsResult.data,
    };
    return pairsResult.errors.length > 0
      ? Result.partial(model, pairsResult.errors)
      : Result.ok(model);
  }

  /**
   * Builds TkvReadModel — same batched pattern as buildCkvReadModel.
   */
  private async buildTkvReadModel(
    row: TkvRow,
    fileSystemId: number,
  ): Promise<Result<TkvReadModel>> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const pairsResult = await this.resolveKeyValuePairs(
      valueDefIds,
      fileSystemId,
    );
    if (pairsResult.isFailure)
      return Result.fail<TkvReadModel>(...pairsResult.errors);

    const model: TkvReadModel = {
      systemId: row.systemId,
      moduleTagIdMapSystemId: row.moduleTagIdMapSystemId,
      keyValuePairs: pairsResult.data,
    };
    return pairsResult.errors.length > 0
      ? Result.partial(model, pairsResult.errors)
      : Result.ok(model);
  }

  /**
   * Resolves valueDefIds to {key, value} pairs via one batched
   * getKeyValueDefinitionForGivenValues call. The batch call dedupes by
   * parent key and silently omits ids that don't resolve, so this flattens
   * the returned KeyDefinitionReadModel[] into a per-valueDefId lookup and
   * reconstructs a not-found item error for any id absent from it — shared
   * by buildCkvReadModel and buildTkvReadModel.
   */
  private async resolveKeyValuePairs(
    valueDefIds: number[],
    fileSystemId: number,
  ): Promise<
    Result<
      Array<{
        key: KeyDefinitionSummaryReadModel;
        value: ValueDefinitionSummaryReadModel;
      }>
    >
  > {
    const keysResult =
      await this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );
    if (keysResult.isFailure) return Result.fail(...keysResult.errors);

    return keysResult;
  }

  /**
   * Builds TkvReadModel[] for all TKVs under one tag map — overlays them
   * in a single batch (overlayTkvRows) instead of once per TKV. Each TKV
   * builds independently — a thrown exception, or a Result.fail from
   * buildTkvReadModel, is captured as an error for that TKV and processing
   * continues for the rest.
   */
  private async buildTagTkvReadModels(
    tagMap: ModuleTagIdMapRow,
    session: ProjectSessionRow | null,
    fileSystemId: number,
  ): Promise<Result<TkvReadModel[]>> {
    const baseTkvs = tagMap.tkvs ?? [];
    const overlaidTkvs = session
      ? await this.overlayTkvRows(baseTkvs, tagMap.systemId, session)
      : baseTkvs;

    const itemErrors: AppError[] = [];
    const results = await Promise.all(
      overlaidTkvs.map(async tkv => {
        try {
          const result = await this.buildTkvReadModel(tkv, fileSystemId);
          if (result.isFailure) {
            itemErrors.push(...result.errors);
            return null;
          }
          itemErrors.push(...result.errors);
          return result.data;
        } catch (error) {
          itemErrors.push({
            code: ERROR_CODES.INTERNAL_ERROR,
            message: `TKV ${tkv.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
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
   * Builds CkvParamReadModel from an overlaid payload row.
   * summary:     identity fields only (systemId, parameterId, name, description, pidType)
   * fullDetails: all fields + optional payload bytes
   */
  private buildParamReadModel(
    payload: CkvParameterPayloadRow | TkvParameterPayloadRow,
    includes: ConfigurationIncludes,
  ): CkvParamReadModel {
    const param = payload.spfParameter!;
    const base = {
      systemId: param.systemId,
      parameterId: param.paramId,
      name: param.name,
      description: param.description,
      pidType: param.pidType ?? '',
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

  // ── Shared helpers ───────────────────────────────────────────────────────

  private async loadTagDefinitions(
    tagDefIds: number[],
  ): Promise<Map<number, TagDefinitionRow>> {
    if (tagDefIds.length === 0) return new Map();
    const rows = (await this.dataSource
      .getRepository('TagDefinition')
      .createQueryBuilder('td')
      .where('td.systemId IN (:...ids)', {ids: tagDefIds})
      .getMany()) as TagDefinitionRow[];
    return new Map(rows.map(r => [r.systemId, r]));
  }
}
