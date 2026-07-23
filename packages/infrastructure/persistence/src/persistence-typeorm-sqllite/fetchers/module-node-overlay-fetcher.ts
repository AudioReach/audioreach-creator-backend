/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SpfModuleBase} from '../entity-schema/usecase-data/module/spf-module.schema.js';
import type {NodeBase} from '../entity-schema/usecase-data/node/node.schema.js';

// Query-ready superset: all columns from spf_modules + nodes.parent_id.
export interface OverlaidSpfModule {
  systemId: number;
  instanceId: number;
  alias: string | null;
  definitionSystemId: number;
  containerSystemId: number;
  subgraphSystemId: number;
  fileSystemId: number;
  parentId: number | null;
}

export class ModuleNodeOverlayFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    moduleSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSpfModule | null> {
    // Load base spf_module row
    const baseModuleRow = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
      .select([
        'sm.systemId',
        'sm.instanceId',
        'sm.alias',
        'sm.definitionSystemId',
        'sm.containerSystemId',
        'sm.subgraphSystemId',
        'sm.fileSystemId',
      ])
      .where(
        'sm.systemId = :moduleSystemId AND sm.fileSystemId = :fileSystemId',
        {moduleSystemId, fileSystemId},
      )
      .getOne()) as unknown as SpfModuleBase | null;

    // Load base node row
    const baseNodeRow = (await this.manager
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .select(['n.systemId', 'n.parentId', 'n.fileSystemId'])
      .where(
        'n.systemId = :moduleSystemId AND n.fileSystemId = :fileSystemId',
        {moduleSystemId, fileSystemId},
      )
      .getOne()) as unknown as NodeBase | null;

    if (sessionId === null) {
      if (baseModuleRow === null) return null;
      return {
        systemId: baseModuleRow.systemId,
        instanceId: baseModuleRow.instanceId,
        alias: baseModuleRow.alias ?? null,
        definitionSystemId: baseModuleRow.definitionSystemId,
        containerSystemId: baseModuleRow.containerSystemId,
        subgraphSystemId: baseModuleRow.subgraphSystemId,
        fileSystemId: baseModuleRow.fileSystemId,
        parentId: baseNodeRow?.parentId ?? null,
      };
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );

    // Overlay the SpfModule fields
    const overlaidModule = applyTableOverlay(
      baseModuleRow as unknown as {systemId: number} | null,
      actions,
      ENTITY_NAMES.SpfModule,
    ) as SpfModuleBase | null;

    if (overlaidModule === null) return null;

    // Overlay the Node parentId (defensive — node delete is rare)
    const overlaidNode = applyTableOverlay(
      baseNodeRow as unknown as {systemId: number} | null,
      actions,
      ENTITY_NAMES.Node,
    ) as NodeBase | null;

    if (overlaidNode === null) return null;

    return {
      systemId: overlaidModule.systemId,
      instanceId: overlaidModule.instanceId,
      alias: overlaidModule.alias ?? null,
      definitionSystemId: overlaidModule.definitionSystemId,
      containerSystemId: overlaidModule.containerSystemId,
      subgraphSystemId: overlaidModule.subgraphSystemId,
      fileSystemId: overlaidModule.fileSystemId,
      parentId: overlaidNode.parentId ?? null,
    };
  }
}
