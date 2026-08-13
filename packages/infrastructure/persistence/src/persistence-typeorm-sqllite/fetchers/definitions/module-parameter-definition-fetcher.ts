/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {CHANGE_OPERATION} from '@arc/core';

export interface ModuleParameterDefinitionBase {
  systemId: number;
  isReadOnly: boolean;
  elementsStructure: string;
  isPersistent: boolean;
}

export class ModuleParameterDefinitionFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsQs: EditActionsQueryService,
  ) {}

  async fetchParameterDefinitions(
    moduleDefSystemId: number,
    sessionId: number | null,
    paramSystemIds?: number[],
  ): Promise<ModuleParameterDefinitionBase[]> {
    let qb = this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('pd')
      .select([
        'pd.systemId',
        'pd.isReadOnly',
        'pd.elementsStructure',
        'pd.isPersistent',
      ])
      .where('pd.spfModuleDefinitionSystemId = :moduleDefSystemId', {
        moduleDefSystemId,
      });

    if (paramSystemIds && paramSystemIds.length > 0) {
      qb = qb.andWhere('pd.systemId IN (:...paramSystemIds)', {paramSystemIds});
    }

    const rows =
      (await qb.getMany()) as unknown as ModuleParameterDefinitionBase[];

    if (sessionId === null) return rows;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      moduleDefSystemId,
      ENTITY_NAMES.SpfModuleParameterDefinition,
    );

    return rows.map(row => {
      const updateAction = actions.find(
        a =>
          a.targetSystemId === row.systemId &&
          a.operation === CHANGE_OPERATION.Update,
      );
      if (!updateAction) return row;
      const delta = (
        typeof updateAction.newValue === 'string'
          ? (JSON.parse(updateAction.newValue) as unknown)
          : updateAction.newValue
      ) as Partial<ModuleParameterDefinitionBase>;
      return {...row, ...delta};
    });
  }
}
