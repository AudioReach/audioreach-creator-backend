/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {applyTableOverlay} from '../../../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {
  SpfModuleDefinitionRow,
  SpfModuleDefinitionBase,
} from '../../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';

/** Overlaid scalar fields from the spf_module_definitions root row. */
export interface OverlaidSpfModuleDefinition {
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  displayName: string | null;
  description: string | null;
  modSearchKeys: string | null;
  stackSize: number;
  processorSystemId: number;
  fileSystemId: number;
  isLoadedAtBootup: boolean;
  /** Overlay-aware list of allowed container type system IDs. */
  containerTypeSystemIds: number[];
}

/**
 * Fetches the SpfModuleDefinition root row and its container-type links with
 * session edit_actions overlay applied.
 *
 * Child tables (data_port_groups, static_control_port_definitions, etc.) are
 * owned by their respective fetchers and are NOT loaded here.
 */
export class SpfModuleDefinitionFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    defSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSpfModuleDefinition | null> {
    const baseDefRow = (await this.manager
      .getRepository<SpfModuleDefinitionRow>(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('smd')
      .select([
        'smd.systemId',
        'smd.moduleDefinitionId',
        'smd.name',
        'smd.displayName',
        'smd.description',
        'smd.modSearchKeys',
        'smd.stackSize',
        'smd.processorSystemId',
        'smd.fileSystemId',
        'smd.isLoadedAtBootup',
      ])
      .where(
        'smd.systemId = :defSystemId AND smd.fileSystemId = :fileSystemId',
        {defSystemId, fileSystemId},
      )
      .getOne()) as unknown as SpfModuleDefinitionBase | null;

    const baseCtRows = (await this.manager
      .getRepository('ModuleDefinitionContainerTypeLink')
      .createQueryBuilder('mdct')
      .select('mdct.containerTypeSystemId')
      .where('mdct.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as {containerTypeSystemId: number}[];

    const baseContainerTypeIds = baseCtRows.map(r =>
      Number(r.containerTypeSystemId),
    );

    if (sessionId === null) {
      if (baseDefRow === null) return null;
      return this.buildResult(baseDefRow, baseContainerTypeIds);
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );

    const overlaidDef = applyTableOverlay(
      baseDefRow as unknown as {systemId: number} | null,
      actions,
      ENTITY_NAMES.SpfModuleDefinition,
    ) as SpfModuleDefinitionBase | null;

    if (overlaidDef === null) return null;

    // Container type links use a composite PK (no system_id); apply manually.
    const ctActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.ModuleDefinitionContainerTypeLink,
    );
    const deletedCtIds = new Set(
      ctActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const createdCtIds = ctActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a =>
        Number(
          (a.newValue as {containerTypeSystemId?: number})
            .containerTypeSystemId ?? 0,
        ),
      )
      .filter(id => id !== 0);

    const containerTypeSystemIds = [
      ...baseContainerTypeIds.filter(id => !deletedCtIds.has(id)),
      ...createdCtIds,
    ];

    return this.buildResult(overlaidDef, containerTypeSystemIds);
  }

  /**
   * Returns the system IDs of SpfModuleDefinitions matching the given filters
   * from the baseline table. Used by list query methods to scope subsequent
   * fetcher calls — same pattern as ModuleNodeOverlayFetcher.loadBaselineNodeIdsForSubgraph.
   *
   * JOINs for processorNaturalId and parameterNaturalId are for filtering only;
   * no data is returned from those tables.
   */
  async getBaseDefinitionIds(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      processorNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<number[]> {
    const qb = this.manager
      .getRepository<SpfModuleDefinitionRow>(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('def')
      .select('def.systemId')
      .where('def.fileSystemId = :fileSystemId', {fileSystemId});

    if (filters.moduleDefinitionNaturalId !== undefined) {
      qb.andWhere('def.moduleDefinitionId = :moduleDefinitionId', {
        moduleDefinitionId: filters.moduleDefinitionNaturalId,
      });
    }
    if (filters.processorNaturalId !== undefined) {
      qb.leftJoin('def.processor', 'processor').andWhere(
        'processor.processorDefinitionId = :processorId',
        {processorId: filters.processorNaturalId},
      );
    }
    if (filters.parameterNaturalId !== undefined) {
      qb.andWhere(
        `EXISTS (${qb
          .subQuery()
          .select('1')
          .from(ENTITY_NAMES.SpfModuleParameterDefinition, 'p2')
          .where('p2.spfModuleDefinitionSystemId = def.systemId')
          .andWhere('p2.paramId = :parameterId')
          .getQuery()})`,
        {parameterId: filters.parameterNaturalId},
      );
    }

    const rows = (await qb.getMany()) as Array<{systemId: number}>;
    return rows.map(r => r.systemId);
  }

  private buildResult(
    def: SpfModuleDefinitionBase,
    containerTypeSystemIds: number[],
  ): OverlaidSpfModuleDefinition {
    return {
      systemId: def.systemId,
      moduleDefinitionId: def.moduleDefinitionId,
      name: def.name,
      displayName: def.displayName ?? null,
      description: def.description ?? null,
      modSearchKeys: def.modSearchKeys ?? null,
      stackSize: def.stackSize,
      processorSystemId: def.processorSystemId,
      fileSystemId: def.fileSystemId,
      isLoadedAtBootup: Boolean(def.isLoadedAtBootup),
      containerTypeSystemIds,
    };
  }
}
