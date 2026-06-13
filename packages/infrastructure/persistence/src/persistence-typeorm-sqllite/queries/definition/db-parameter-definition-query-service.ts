/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import type {
  ParameterDefinitionQueryService,
  ParameterDefinitionReadModel,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {SpfModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';

/**
 * Database implementation of ParameterDefinitionQueryService.
 *
 * Applies the three-tier session overlay pattern to parameter definition rows.
 * Parameter definitions are keyed by spfModuleDefinitionSystemId (the module
 * definition's PK), not by the CKV aggregate ID.
 */
export class DbParameterDefinitionQueryService implements ParameterDefinitionQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
  ) {}

  async getParameterDefinitions(
    fileSystemId: number,
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterDefinitionReadModel[]> {
    const session =
      await this.editActionsQueryService.findActiveSession(fileSystemId);
    if (!session)
      return this.queryParameterDefinitions(moduleDefSystemId, paramSystemIds);

    const editActions =
      await this.editActionsQueryService.getEditActionsByAggregateId(
        session.sessionId,
        moduleDefSystemId,
      );
    if (editActions.length === 0)
      return this.queryParameterDefinitions(moduleDefSystemId, paramSystemIds);

    const defActions = editActions.filter(
      a => a.tableName === ENTITY_NAMES.SpfModuleParameterDefinition,
    );
    const baseDefs = await this.queryParameterDefinitionsRaw(moduleDefSystemId);
    const overlaidDefs = applyToCollection(baseDefs, defActions);

    const filtered = paramSystemIds
      ? overlaidDefs.filter(d => paramSystemIds.includes(d.systemId))
      : overlaidDefs;

    return filtered.map(r => this.transformToParameterDefinitionReadModel(r));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async queryParameterDefinitions(
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterDefinitionReadModel[]> {
    const rows = await this.queryParameterDefinitionsRaw(
      moduleDefSystemId,
      paramSystemIds,
    );
    return rows.map(r => this.transformToParameterDefinitionReadModel(r));
  }

  private async queryParameterDefinitionsRaw(
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<SpfModuleParameterDefinitionRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('def')
      .where('def.spfModuleDefinitionSystemId = :moduleDefSystemId', {
        moduleDefSystemId,
      });
    if (paramSystemIds && paramSystemIds.length > 0) {
      qb.andWhere('def.systemId IN (:...ids)', {ids: paramSystemIds});
    }
    return qb.getMany() as Promise<SpfModuleParameterDefinitionRow[]>;
  }

  private transformToParameterDefinitionReadModel(
    row: SpfModuleParameterDefinitionRow,
  ): ParameterDefinitionReadModel {
    return {
      systemId: row.systemId,
      parameterId: row.paramId,
      name: row.name ?? '',
      description: row.description,
      elementsStructure: row.elementsStructure ?? '',
      isReadOnly: row.isReadOnly ?? false,
      pidType: row.pidType ?? '',
    };
  }
}
