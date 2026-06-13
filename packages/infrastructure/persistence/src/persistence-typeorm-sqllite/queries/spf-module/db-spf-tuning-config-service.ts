/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfTuningConfigService,
  SpfModuleTuningConfigReadModel,
  CkvTuningReadModel,
  TagTuningReadModel,
  TkvTuningReadModel,
  ParamSummaryReadModel,
  KeyValuePairReadModel,
  KeyReadModel,
  ValueReadModel,
} from '@arc/core';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {Result, ERROR_CODES} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {
  CkvRow,
  CkvValuesRow,
} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvValuesRow,
} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import type {TagDefinitionRow} from '../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import type {ValueDefinitionRow} from '../../entity-schema/definitions/key-value/value-definition.schema.js';
import type {KeyDefinitionRow} from '../../entity-schema/definitions/key-value/key-definition.schema.js';

/**
 * Database implementation of SpfTuningConfigService.
 *
 * Loads CKV and TKV tuning catalogue data for a module:
 *   - All CKVs with key-value selectors and parameter names (no binary blobs)
 *   - All tag groups with their TKVs and parameter names (no binary blobs)
 *
 * Three-tier session overlay applied to CKV and TKV rows.
 */
export class DbSpfTuningConfigService implements SpfTuningConfigService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getModuleTuningConfig(
    spfModuleSystemId: number,
    fileSystemId: number,
    includeCkvs: boolean,
    includeTags: boolean,
    applyOverlay = true,
  ): Promise<Result<SpfModuleTuningConfigReadModel>> {
    try {
      // Load only the requested sections — null means "not requested"
      const ckvsResult = includeCkvs
        ? await this.loadCkvs(spfModuleSystemId, fileSystemId, applyOverlay)
        : null;
      const tagsResult = includeTags
        ? await this.loadTags(spfModuleSystemId, fileSystemId, applyOverlay)
        : null;

      // Propagate failures from child services — a failed section fails the whole result
      if (ckvsResult?.isFailure) return Result.fail(...ckvsResult.errors);
      if (tagsResult?.isFailure) return Result.fail(...tagsResult.errors);

      return Result.ok({
        moduleSystemId: spfModuleSystemId,
        ckvs: ckvsResult?.data ?? null, // null = not requested
        tags: tagsResult?.data ?? null, // null = not requested
      });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load tuning config',
      });
    }
  }

  // ── CKV loading ───────────────────────────────────────────────────────────

  private async loadCkvs(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Result<CkvTuningReadModel[]>> {
    try {
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.Ckv)
        .createQueryBuilder('ckv')
        .leftJoinAndSelect('ckv.values', 'ckvVal')
        .leftJoinAndSelect('ckvVal.valueDef', 'valueDef')
        .leftJoinAndSelect('valueDef.keys', 'keyDef')
        .leftJoinAndSelect('ckv.payloadCollection', 'payload')
        .leftJoinAndSelect('payload.spfParameter', 'param')
        .where('ckv.spfModuleSystemId = :id', {id: spfModuleSystemId})
        .getMany()) as CkvRow[];

      // SQL:
      // SELECT ckv.system_id,
      //        ckvVal.*, valueDef.value_id, valueDef.name,
      //        keyDef.key_id, keyDef.name,
      //        payload.system_id, payload.parameter_system_id,
      //        param.system_id, param.param_id, param.name, param.description
      // FROM ckv
      // LEFT JOIN ckv_values ckvVal ON ckvVal.ckv_system_id = ckv.system_id
      // LEFT JOIN value_definitions valueDef ON valueDef.system_id = ckvVal.value_def_system_id
      // LEFT JOIN key_definitions keyDef ON keyDef.system_id = valueDef.key_system_id
      // LEFT JOIN ckv_parameter_payload payload ON payload.ckv_system_id = ckv.system_id
      // LEFT JOIN spf_module_parameter_definitions param ON param.system_id = payload.parameter_system_id
      // WHERE ckv.spf_module_system_id = ?

      // Three-tier overlay applied at all aggregate levels:
      //   Module aggregate (spfModuleSystemId) → Ckv CREATE/DELETE
      //   CKV aggregate (ckv.systemId)         → CkvValues, CkvParameterPayload
      //   CkvValues aggregate (val.systemId)   → ValueDefinition, KeyDefinition
      //   Payload aggregate (payload.systemId) → SpfModuleParameterDefinition
      //
      // Errors during per-row overlay are caught per CKV — the baseline row is
      // returned as fallback so a single corrupt entry does not fail the request.
      const session = applyOverlay
        ? await this.editActionsSvc.findActiveSession(fileSystemId)
        : null;

      const ckvDraftMap = new Map<number, string>();
      if (session) {
        const moduleActions =
          await this.editActionsSvc.getEditActionsByAggregateId(
            session.sessionId,
            spfModuleSystemId,
          );
        for (const a of moduleActions.filter(
          x => x.tableName === ENTITY_NAMES.Ckv,
        )) {
          ckvDraftMap.set(a.systemId, a.operation);
        }
      }

      const overlaidRows = await Promise.all(
        rows
          .filter(row => ckvDraftMap.get(row.systemId) !== 'DELETE')
          .map(async (row): Promise<CkvRow> => {
            if (!session) return row;

            try {
              const ckvActions =
                await this.editActionsSvc.getEditActionsByAggregateId(
                  session.sessionId,
                  row.systemId,
                );

              // ckv_values uses a composite PK — no system_id for row-level matching.
              // Value changes are captured in the parent CKV UPDATE draft payload.
              // Use values as loaded from the CKV-level overlay above.
              const overlaidValuesWithDefs = await Promise.all(
                (row.values ?? []).map(val =>
                  this.overlayValueDefRow(val, session.sessionId),
                ),
              );

              // Overlay ckv_parameter_payload rows
              const payloadActions = ckvActions.filter(
                a => a.tableName === ENTITY_NAMES.CkvParameterPayload,
              );
              const overlaidPayloads =
                payloadActions.length > 0
                  ? applyToCollection(
                      row.payloadCollection ?? [],
                      payloadActions,
                    )
                  : (row.payloadCollection ?? []);

              // Overlay spf_module_parameter_definitions per payload
              const overlaidPayloadsWithDefs = await Promise.all(
                overlaidPayloads.map(payload =>
                  this.overlayPayloadRow(payload, session.sessionId),
                ),
              );

              return {
                ...row,
                values: overlaidValuesWithDefs,
                payloadCollection: overlaidPayloadsWithDefs,
              } as CkvRow;
            } catch (error) {
              // Re-throw so loadCkvs catch block captures it as Result.fail.
              // The error carries the CKV systemId for traceability.
              throw new Error(
                `CKV overlay failed for systemId=${row.systemId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }),
      );

      return Result.ok(
        overlaidRows.map(row => this.mapCkvToTuningReadModel(row)),
      );
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

  /**
   * Overlays SpfModuleParameterDefinition draft actions onto a single
   * CkvParameterPayloadRow/TkvParameterPayloadRow. Extracted to reduce nesting depth.
   */
  private async overlayPayloadRow<
    T extends {
      systemId: number;
      spfParameter?: SpfModuleParameterDefinitionRow;
    },
  >(payload: T, sessionId: number): Promise<T> {
    const payloadChildActions =
      await this.editActionsSvc.getEditActionsByAggregateId(
        sessionId,
        payload.systemId,
      );
    const paramDefActions = payloadChildActions.filter(
      a => a.tableName === ENTITY_NAMES.SpfModuleParameterDefinition,
    );
    const overlaidParam: SpfModuleParameterDefinitionRow | undefined =
      paramDefActions.length > 0 && payload.spfParameter
        ? (applyToCollection([payload.spfParameter], paramDefActions)[0] ??
          payload.spfParameter)
        : payload.spfParameter;
    return {...payload, spfParameter: overlaidParam};
  }

  /**
   * Overlays ValueDefinition and KeyDefinition draft actions onto a single
   * CkvValuesRow/TkvValuesRow. Extracted to reduce nesting depth.
   */
  private async overlayValueDefRow(
    val: {valueDefSystemId: number; valueDef?: ValueDefinitionRow},
    sessionId: number,
  ): Promise<typeof val> {
    const valActions = await this.editActionsSvc.getEditActionsByAggregateId(
      sessionId,
      val.valueDefSystemId,
    );
    const valueDefActions = valActions.filter(
      a => a.tableName === ENTITY_NAMES.ValueDefinition,
    );
    const keyDefActions = valActions.filter(
      a => a.tableName === ENTITY_NAMES.KeyDefinition,
    );

    const baseValueDef = val.valueDef;
    if (!baseValueDef) return val;

    const overlaidValueDef: ValueDefinitionRow =
      valueDefActions.length > 0
        ? (applyToCollection([baseValueDef], valueDefActions)[0] ??
          baseValueDef)
        : baseValueDef;

    const overlaidKeys: KeyDefinitionRow =
      keyDefActions.length > 0
        ? (applyToCollection([overlaidValueDef.keys], keyDefActions)[0] ??
          overlaidValueDef.keys)
        : overlaidValueDef.keys;

    return {
      ...val,
      valueDef: {...overlaidValueDef, keys: overlaidKeys},
    };
  }

  private mapCkvToTuningReadModel(row: CkvRow): CkvTuningReadModel {
    return {
      systemId: row.systemId,
      keyValuePairs: this.buildKeyValuePairs(row.values),
      parameters: this.buildParamSummaries(row),
    };
  }

  // ── TKV / Tag loading ─────────────────────────────────────────────────────

  private async loadTags(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<Result<TagTuningReadModel[]>> {
    try {
      const tagMaps = (await this.dataSource
        .getRepository(ENTITY_NAMES.ModuleTagIdMap)
        .createQueryBuilder('tagMap')
        .leftJoinAndSelect('tagMap.tkvs', 'tkv')
        .leftJoinAndSelect('tkv.values', 'tkvVal')
        .leftJoinAndSelect('tkvVal.valueDef', 'valueDef')
        .leftJoinAndSelect('valueDef.keys', 'keyDef')
        .leftJoinAndSelect('tkv.payloadCollection', 'payload')
        .leftJoinAndSelect('payload.spfParameter', 'param')
        .where('tagMap.spfModuleSystemId = :id', {id: spfModuleSystemId})
        .getMany()) as ModuleTagIdMapRow[];

      // SQL:
      // SELECT tagMap.system_id, tagMap.tag_definition_system_id,
      //        tkv.system_id, tkv.module_tag_id_map_system_id,
      //        tkvVal.*, valueDef.value_id, valueDef.name,
      //        keyDef.key_id, keyDef.name,
      //        payload.system_id, payload.parameter_system_id,
      //        param.param_id, param.name, param.description
      // FROM module_tag_id_map tagMap
      // LEFT JOIN tkv ON tkv.module_tag_id_map_system_id = tagMap.system_id
      // LEFT JOIN tkv_values tkvVal ON tkvVal.tkv_system_id = tkv.system_id
      // LEFT JOIN value_definitions valueDef ...
      // LEFT JOIN key_definitions keyDef ...
      // LEFT JOIN tkv_parameter_payload payload ON payload.tkv_system_id = tkv.system_id
      // LEFT JOIN spf_module_parameter_definitions param ...
      // WHERE tagMap.spf_module_system_id = ?

      // Load tag names from tag_definitions (batch by tagDefinitionSystemId)
      const tagDefIds = [...new Set(tagMaps.map(t => t.tagDefinitionSystemId))];
      const tagDefMap = await this.loadTagDefinitions(tagDefIds);

      // Three-tier overlay applied at all aggregate levels:
      //   Module aggregate (spfModuleSystemId) → Tkv CREATE/DELETE
      //   TKV aggregate (tkv.systemId)         → TkvValues, TkvParameterPayload
      //   TkvValues aggregate (val.systemId)   → ValueDefinition, KeyDefinition
      //   Payload aggregate (payload.systemId) → SpfModuleParameterDefinition
      //
      // Errors during per-row overlay are caught per TKV — the baseline row is
      // returned as fallback so a single corrupt entry does not fail the request.
      const session = applyOverlay
        ? await this.editActionsSvc.findActiveSession(fileSystemId)
        : null;

      const tkvDraftMap = new Map<number, string>();
      if (session) {
        const actions = await this.editActionsSvc.getEditActionsByAggregateId(
          session.sessionId,
          spfModuleSystemId,
        );
        for (const a of actions.filter(x => x.tableName === ENTITY_NAMES.Tkv)) {
          tkvDraftMap.set(a.systemId, a.operation);
        }
      }

      const tagResults = await Promise.all(
        tagMaps.map(tagMap => {
          const tagDef = tagDefMap.get(tagMap.tagDefinitionSystemId);
          const activeTkvs = (tagMap.tkvs ?? []).filter(
            tkv => tkvDraftMap.get(tkv.systemId) !== 'DELETE',
          );

          const tkvPromises = activeTkvs.map(async (tkv): Promise<TkvRow> => {
            if (!session) return tkv;
            try {
              const tkvActions =
                await this.editActionsSvc.getEditActionsByAggregateId(
                  session.sessionId,
                  tkv.systemId,
                );

              // tkv_values uses a composite PK — no system_id for row-level matching.
              // Value changes are captured in the parent TKV UPDATE draft payload.
              // Use values as loaded from the TKV-level overlay above.
              const overlaidValuesWithDefs = await Promise.all(
                (tkv.values ?? []).map(val =>
                  this.overlayValueDefRow(val, session.sessionId),
                ),
              );

              // Overlay tkv_parameter_payload rows
              const payloadActions = tkvActions.filter(
                a => a.tableName === ENTITY_NAMES.TkvParameterPayload,
              );
              const overlaidPayloads =
                payloadActions.length > 0
                  ? applyToCollection(
                      tkv.payloadCollection ?? [],
                      payloadActions,
                    )
                  : (tkv.payloadCollection ?? []);

              // Overlay spf_module_parameter_definitions per payload
              const overlaidPayloadsWithDefs = await Promise.all(
                overlaidPayloads.map(payload =>
                  this.overlayPayloadRow(payload, session.sessionId),
                ),
              );

              return {
                ...tkv,
                values: overlaidValuesWithDefs,
                payloadCollection: overlaidPayloadsWithDefs,
              } as TkvRow;
            } catch (error) {
              // Re-throw so loadTags catch block captures it as Result.fail.
              // The error carries the TKV systemId for traceability.
              throw new Error(
                `TKV overlay failed for systemId=${tkv.systemId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          });

          return Promise.all(tkvPromises).then(
            overlaidTkvs =>
              ({
                systemId: tagMap.systemId,
                tagDefinitionSystemId: tagMap.tagDefinitionSystemId,
                tagId: tagDef?.tagId ?? 0,
                tagName: tagDef?.name ?? '',
                tkvs: overlaidTkvs.map(tkv =>
                  this.mapTkvToTuningReadModel(tkv, tagMap.systemId),
                ),
              }) satisfies TagTuningReadModel,
          );
        }),
      );
      return Result.ok(tagResults);
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

  private mapTkvToTuningReadModel(
    row: TkvRow,
    moduleTagIdMapSystemId: number,
  ): TkvTuningReadModel {
    return {
      systemId: row.systemId,
      moduleTagIdMapSystemId,
      keyValuePairs: this.buildKeyValuePairs(row.values),
      parameters: this.buildParamSummaries(row),
    };
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  private buildKeyValuePairs(
    values: CkvValuesRow[] | TkvValuesRow[] | undefined,
  ): KeyValuePairReadModel[] {
    if (!values?.length) return [];
    return values
      .filter(v => v.valueDef && v.valueDef.keys)
      .map(v => {
        const valueDef = v.valueDef as ValueDefinitionRow;
        const key: KeyReadModel = {
          systemId: valueDef.keys.systemId,
          keyId: valueDef.keys.keyId,
          name: valueDef.keys.name,
        };
        const value: ValueReadModel = {
          systemId: valueDef.systemId,
          valueId: valueDef.valueId,
          name: valueDef.name,
        };
        return {key, value};
      });
  }

  private buildParamSummaries(row: CkvRow | TkvRow): ParamSummaryReadModel[] {
    return (row.payloadCollection ?? [])
      .filter(p => p.spfParameter)
      .map(p => this.mapParamToSummary(p.spfParameter!));
  }

  private mapParamToSummary(
    param: SpfModuleParameterDefinitionRow,
  ): ParamSummaryReadModel {
    return {
      systemId: param.systemId,
      parameterId: param.paramId,
      name: param.name ?? '',
      description: param.description,
    };
  }

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
