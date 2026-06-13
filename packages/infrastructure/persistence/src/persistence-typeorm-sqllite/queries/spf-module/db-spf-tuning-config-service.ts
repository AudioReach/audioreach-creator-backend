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
  CkvKeyValuePairReadModel,
  CkvKeyReadModel,
  CkvValueReadModel,
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
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
    applyOverlay = true,
  ): Promise<SpfModuleTuningConfigReadModel> {
    const [ckvs, tags] = await Promise.all([
      this.loadCkvs(spfModuleSystemId, fileSystemId, applyOverlay),
      this.loadTags(spfModuleSystemId, fileSystemId, applyOverlay),
    ]);
    return {moduleSystemId: spfModuleSystemId, ckvs, tags};
  }

  // ── CKV loading ───────────────────────────────────────────────────────────

  private async loadCkvs(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<CkvTuningReadModel[]> {
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

    // Three-tier overlay — only on ckv rows, not on parameter definitions
    const session = applyOverlay
      ? await this.editActionsSvc.findActiveSession(fileSystemId)
      : null;

    const ckvDraftMap = new Map<number, string>(); // systemId → operation
    if (session) {
      const actions = await this.editActionsSvc.getEditActionsByAggregateId(
        session.sessionId,
        spfModuleSystemId,
      );
      for (const a of actions.filter(x => x.tableName === ENTITY_NAMES.Ckv)) {
        ckvDraftMap.set(a.systemId, a.operation);
      }
    }

    return rows
      .filter(row => ckvDraftMap.get(row.systemId) !== 'DELETE')
      .map(row => this.mapCkvToTuningReadModel(row, ckvDraftMap));
  }

  private mapCkvToTuningReadModel(
    row: CkvRow,
    draftMap: Map<number, string>,
  ): CkvTuningReadModel {
    return {
      systemId: row.systemId,
      changeInfo: draftMap.has(row.systemId)
        ? {changeType: draftMap.get(row.systemId) as any, changeId: undefined}
        : {changeType: CHANGE_OPERATION.None},
      keyValuePairs: this.buildKeyValuePairs(row.values),
      parameters: this.buildParamSummaries(row),
    };
  }

  // ── TKV / Tag loading ─────────────────────────────────────────────────────

  private async loadTags(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay: boolean,
  ): Promise<TagTuningReadModel[]> {
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

    return tagMaps.map(tagMap => {
      const tagDef = tagDefMap.get(tagMap.tagDefinitionSystemId);
      return {
        systemId: tagMap.systemId,
        changeInfo: {changeType: CHANGE_OPERATION.None},
        tagDefinitionSystemId: tagMap.tagDefinitionSystemId,
        tagId: tagDef?.tagId ?? 0,
        tagName: tagDef?.name ?? '',
        tkvs: (tagMap.tkvs ?? [])
          .filter(tkv => tkvDraftMap.get(tkv.systemId) !== 'DELETE')
          .map(tkv =>
            this.mapTkvToTuningReadModel(tkv, tagMap.systemId, tkvDraftMap),
          ),
      } satisfies TagTuningReadModel;
    });
  }

  private mapTkvToTuningReadModel(
    row: TkvRow,
    moduleTagIdMapSystemId: number,
    draftMap: Map<number, string>,
  ): TkvTuningReadModel {
    return {
      systemId: row.systemId,
      changeInfo: draftMap.has(row.systemId)
        ? {changeType: draftMap.get(row.systemId) as any}
        : {changeType: CHANGE_OPERATION.None},
      moduleTagIdMapSystemId,
      keyValuePairs: this.buildKeyValuePairs(row.values),
      parameters: this.buildParamSummariesFromTkv(row),
    };
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  private buildKeyValuePairs(
    values: CkvValuesRow[] | TkvValuesRow[] | undefined,
  ): CkvKeyValuePairReadModel[] {
    if (!values?.length) return [];
    return values
      .filter(v => v.valueDef && (v.valueDef as ValueDefinitionRow).keys)
      .map(v => {
        const valueDef = v.valueDef as ValueDefinitionRow;
        const key: CkvKeyReadModel = {
          systemId: valueDef.keys.systemId,
          changeInfo: {changeType: CHANGE_OPERATION.None},
          keyId: valueDef.keys.keyId,
          name: valueDef.keys.name,
        };
        const value: CkvValueReadModel = {
          systemId: valueDef.systemId,
          changeInfo: {changeType: CHANGE_OPERATION.None},
          valueId: valueDef.valueId,
          name: valueDef.name,
        };
        return {key, value};
      });
  }

  private buildParamSummaries(row: CkvRow): ParamSummaryReadModel[] {
    return (row.payloadCollection ?? [])
      .filter(p => p.spfParameter)
      .map(p => this.mapParamToSummary(p.spfParameter!));
  }

  private buildParamSummariesFromTkv(row: TkvRow): ParamSummaryReadModel[] {
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
    if (!tagDefIds.length) return new Map();
    const rows = (await this.dataSource
      .getRepository('TagDefinition')
      .createQueryBuilder('td')
      .where('td.systemId IN (:...ids)', {ids: tagDefIds})
      .getMany()) as TagDefinitionRow[];
    return new Map(rows.map(r => [r.systemId, r]));
  }
}
