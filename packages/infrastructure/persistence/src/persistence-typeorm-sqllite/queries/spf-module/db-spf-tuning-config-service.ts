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
  KeyReadModel,
  ValueReadModel,
} from '@arc/core';
import {Result, ERROR_CODES} from '@arc/core';
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
    includes: ConfigurationIncludes,
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

      // Step 3 — Per CKV, delegate key-value pairs to KeyValueDefQueryService
      // includes controls depth: summary=KeyReadModel, fullDetails=KeyDefinitionReadModel
      const results = await Promise.all(
        overlaidRows.map(async row =>
          this.buildCkvReadModel(row, fileSystemId, includes),
        ),
      );

      return Result.ok(results);
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
      // Step 1 — QueryBuilder: joins driven by includes
      // fullDetails implies summary — both gates load tkvs + tkv_values
      let qb = this.dataSource
        .getRepository(ENTITY_NAMES.ModuleTagIdMap)
        .createQueryBuilder('tagMap')
        .where('tagMap.spfModuleSystemId = :id', {id: spfModuleSystemId});

      if (includes.summary || includes.fullDetails) {
        qb = qb
          .leftJoinAndSelect('tagMap.tkvs', 'tkv')
          .leftJoinAndSelect('tkv.values', 'tkvVal');
      }

      if (includes.fullDetails) {
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

      // Step 4 — Per tag map, build TKV read models inline
      const results = await Promise.all(
        overlaidRows.map(async r => {
          const tagDef = tagDefMap.get(r.tagDefinitionSystemId);
          const loadTkvs = includes.summary || includes.fullDetails;
          const tkvs = loadTkvs
            ? await Promise.all(
                (r.tkvs ?? []).map(async tkv => {
                  const overlaidTkv = session
                    ? await this.overlayTkvRow(tkv, r.systemId, session)
                    : tkv;
                  if (!overlaidTkv) return null;
                  return this.buildTkvReadModel(
                    overlaidTkv,
                    fileSystemId,
                    includes,
                  );
                }),
              ).then(arr => arr.filter((t): t is TkvReadModel => t !== null))
            : [];

          return {
            systemId: r.systemId,
            tagDefinitionSystemId: r.tagDefinitionSystemId,
            tagId: tagDef?.tagId ?? 0,
            tagName: tagDef?.name ?? '',
            tkvs,
          } satisfies TagReadModel;
        }),
      );

      return Result.ok(results);
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
   * Overlays a single TKV row at the tag map aggregate level.
   * Returns null when the TKV is deleted in the session.
   */
  private async overlayTkvRow(
    row: TkvRow,
    moduleTagIdMapSystemId: number,
    session: ProjectSessionRow,
  ): Promise<TkvRow | null> {
    const actions = await this.editActionsSvc.getEditActionsByAggregateId(
      session.sessionId,
      moduleTagIdMapSystemId,
    );
    return applyTableOverlay(row, actions, ENTITY_NAMES.Tkv);
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
   * KeyValueDefQueryService.getByValueDefinitions in one batched call,
   * instead of one getByValueDefinition call per valueDefId (N+1).
   */
  private async buildCkvReadModel(
    row: CkvRow,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<CkvReadModel> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const kvMap = await this.keyValueDefSvc.getByValueDefinitions(
      valueDefIds,
      fileSystemId,
      includes,
    );

    return {
      systemId: row.systemId,
      keyValuePairs: valueDefIds
        .map(id => kvMap.get(id))
        .filter((kv): kv is NonNullable<typeof kv> => kv != null)
        .map(kv => ({
          key: this.toKeyReadModel(kv.key),
          value: this.toValueReadModel(kv.value),
        })),
    };
  }

  /**
   * Builds TkvReadModel — same batched pattern as buildCkvReadModel.
   */
  private async buildTkvReadModel(
    row: TkvRow,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<TkvReadModel> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const kvMap = await this.keyValueDefSvc.getByValueDefinitions(
      valueDefIds,
      fileSystemId,
      includes,
    );

    return {
      systemId: row.systemId,
      moduleTagIdMapSystemId: row.moduleTagIdMapSystemId,
      keyValuePairs: valueDefIds
        .map(id => kvMap.get(id))
        .filter((kv): kv is NonNullable<typeof kv> => kv != null)
        .map(kv => ({
          key: this.toKeyReadModel(kv.key),
          value: this.toValueReadModel(kv.value),
        })),
    };
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
      definition: includes.fullDetails
        ? {
            ...base,
            elementsStructure: param.elementsStructure,
            isPersistent: param.isPersistent,
            isReadOnly: param.isReadOnly,
            maxSize: param.maxSize,
            toolPolicies: param.toolPolicies,
          }
        : base,
      ...(includes.fullDetails && payload.payload
        ? {payload: payload.payload}
        : {}),
    };
  }

  // ── Projection helpers ───────────────────────────────────────────────────

  private toKeyReadModel(key: {
    systemId: number;
    keyId: number;
    name: string;
    description?: string;
  }): KeyReadModel {
    return {
      systemId: key.systemId,
      keyId: key.keyId,
      name: key.name,
      description: key.description,
    };
  }

  private toValueReadModel(value: {
    systemId: number;
    valueId: number;
    name: string;
    description?: string;
  }): ValueReadModel {
    return {
      systemId: value.systemId,
      valueId: value.valueId,
      name: value.name,
      description: value.description,
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
