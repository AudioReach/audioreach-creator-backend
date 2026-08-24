/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';

export interface ModuleParameterDefinitionBase {
  systemId: number;
  paramId: number;
  name?: string;
  description?: string;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  elementsStructure: string;
  isReadOnly: boolean;
  toolPolicies?: string;
  spfModuleDefinitionSystemId: number;
}

export class ModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

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

    return this.overlay
      .applyToCollection<ModuleParameterDefinitionBase>(rows, actions)
      .map(r => r.effective);
  }
}
