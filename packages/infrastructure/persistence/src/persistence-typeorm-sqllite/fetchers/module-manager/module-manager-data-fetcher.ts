/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {ModuleManagerDataBase} from '../../entity-schema/module-manager/module-manager-data.js';
import type {
  InterfaceTypeValue,
  InterfaceVersionValue,
  ModuleTypeValue,
} from '../../entity-schema/module-manager/types.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../../queries/shared/filter-utils.js';

/** Optional scalar filters for ModuleManagerData queries. */
export type ModuleManagerDataFilters = {
  systemId?: number | number[];
  moduleDefinitionSystemId?: number | number[];
  fileSystemId?: number | number[];
  moduleType?: ModuleTypeValue | ModuleTypeValue[];
  interfaceType?: InterfaceTypeValue | InterfaceTypeValue[];
  interfaceVersion?: InterfaceVersionValue | InterfaceVersionValue[];
  fileName?: string | string[];
  tag?: string | string[];
  $or?: ModuleManagerDataFilters[];
};

/**
 * Fetches module_manager_data rows with session overlay applied.
 *
 * The module definition system IDs are the child-row scope, and child edit
 * actions use the owning definition system ID as aggregateId.
 */
export class ModuleManagerDataFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
    filters?: ModuleManagerDataFilters,
  ): Promise<ModuleManagerDataBase[]> {
    if (moduleDefinitionSystemIds.length === 0) return [];

    const qb = this.manager
      .getRepository(ENTITY_NAMES.ModuleManagerData)
      .createQueryBuilder('mmd')
      .where('mmd.moduleDefinitionSystemId IN (:...definitionSystemIds)', {
        definitionSystemIds: moduleDefinitionSystemIds,
      })
      .andWhere('mmd.fileSystemId = :fileSystemId', {fileSystemId});
    if (filters) applyEntityFilters(qb, 'mmd', filters);

    const baseRows = (await qb.getMany()) as ModuleManagerDataBase[];
    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ModuleManagerData,
    );
    const definitionIdSet = new Set(moduleDefinitionSystemIds);
    const relevantActions = allActions.filter(action =>
      definitionIdSet.has(action.aggregateId),
    );
    const createFilter = (newValue: Record<string, unknown>) => {
      const definitionId = newValue.moduleDefinitionSystemId;
      return (
        typeof definitionId === 'number' &&
        definitionIdSet.has(definitionId) &&
        newValue.fileSystemId === fileSystemId &&
        (filters === undefined || matchesEntityFilters(newValue, filters))
      );
    };

    return this.overlay
      .applyToCollection(baseRows, relevantActions, createFilter)
      .map(row => row.effective);
  }

  /** Returns one overlaid row through the collection path. */
  async fetchOne(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ModuleManagerDataBase | null> {
    const rows = await this.fetchMany(
      [moduleDefinitionSystemId],
      fileSystemId,
      sessionId,
    );
    return rows[0] ?? null;
  }
}
