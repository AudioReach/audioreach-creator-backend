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

/** Fields from the definition root + overlaid container type system IDs. */
export interface OverlaidDefinitionRoot {
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  displayName: string | null;
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
 */
export class SpfModuleDefinitionRootFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    defSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDefinitionRoot | null> {
    const baseDefRow = (await this.manager
      .getRepository<SpfModuleDefinitionRow>(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('smd')
      .select([
        'smd.systemId',
        'smd.moduleDefinitionId',
        'smd.name',
        'smd.displayName',
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

  private buildResult(
    def: SpfModuleDefinitionBase,
    containerTypeSystemIds: number[],
  ): OverlaidDefinitionRoot {
    return {
      systemId: def.systemId,
      moduleDefinitionId: def.moduleDefinitionId,
      name: def.name,
      displayName: def.displayName ?? null,
      stackSize: def.stackSize,
      processorSystemId: def.processorSystemId,
      fileSystemId: def.fileSystemId,
      isLoadedAtBootup: Boolean(def.isLoadedAtBootup),
      containerTypeSystemIds,
    };
  }
}
