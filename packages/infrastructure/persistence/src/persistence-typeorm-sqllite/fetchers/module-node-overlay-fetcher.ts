/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SpfModuleBase} from '../entity-schema/usecase-data/module/spf-module.schema.js';
import type {NodeBase} from '../entity-schema/usecase-data/node/node.schema.js';

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
  private readonly overlay = new OverlayMergeImpl();

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

  async applyToModuleNodes(
    moduleSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSpfModule[]> {
    if (moduleSystemIds.length === 0) return [];

    const baseSpfRows = (await this.manager
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
      .where('sm.systemId IN (:...ids) AND sm.fileSystemId = :fileSystemId', {
        ids: moduleSystemIds,
        fileSystemId,
      })
      .getMany()) as unknown as SpfModuleBase[];

    const baseNodeRows = (await this.manager
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .select(['n.systemId', 'n.parentId', 'n.fileSystemId'])
      .where('n.systemId IN (:...ids) AND n.fileSystemId = :fileSystemId', {
        ids: moduleSystemIds,
        fileSystemId,
      })
      .getMany()) as unknown as NodeBase[];

    if (sessionId === null) {
      const nodeMap = new Map(baseNodeRows.map(n => [n.systemId, n]));
      return baseSpfRows.map(sm => ({
        systemId: sm.systemId,
        instanceId: sm.instanceId,
        alias: sm.alias ?? null,
        definitionSystemId: sm.definitionSystemId,
        containerSystemId: sm.containerSystemId,
        subgraphSystemId: sm.subgraphSystemId,
        fileSystemId: sm.fileSystemId,
        parentId: nodeMap.get(sm.systemId)?.parentId ?? null,
      }));
    }

    const moduleIdSet = new Set(moduleSystemIds);
    const [allSpfActions, allNodeActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.SpfModule),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node),
    ]);
    const spfActions = allSpfActions.filter(a =>
      moduleIdSet.has(a.targetSystemId),
    );
    const nodeActions = allNodeActions.filter(a =>
      moduleIdSet.has(a.targetSystemId),
    );

    const spfUpdateDelete = spfActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const nodeUpdateDelete = nodeActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );

    const overlaidSpf = this.overlay
      .applyToCollection(baseSpfRows, spfUpdateDelete)
      .map(r => r.effective);
    const overlaidNode = this.overlay
      .applyToCollection(baseNodeRows, nodeUpdateDelete)
      .map(r => r.effective);

    const baseSpfIds = new Set(baseSpfRows.map(r => r.systemId));
    const createdSpf: SpfModuleBase[] = spfActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseSpfIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SpfModuleBase>;
        return {
          systemId: a.targetSystemId,
          instanceId: p.instanceId ?? 0,
          alias: p.alias ?? '',
          definitionSystemId: p.definitionSystemId ?? 0,
          containerSystemId: p.containerSystemId ?? 0,
          subgraphSystemId: p.subgraphSystemId ?? 0,
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    const baseNodeIds = new Set(baseNodeRows.map(r => r.systemId));
    const createdNode: NodeBase[] = nodeActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseNodeIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<NodeBase>;
        return {
          systemId: a.targetSystemId,
          parentId: p.parentId,
          type: p.type ?? 'module',
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    const nodeMap = new Map(
      [...overlaidNode, ...createdNode].map(n => [n.systemId, n]),
    );
    return [...overlaidSpf, ...createdSpf].map(sm => ({
      systemId: sm.systemId,
      instanceId: sm.instanceId,
      alias: sm.alias ?? null,
      definitionSystemId: sm.definitionSystemId,
      containerSystemId: sm.containerSystemId,
      subgraphSystemId: sm.subgraphSystemId,
      fileSystemId: sm.fileSystemId,
      parentId: nodeMap.get(sm.systemId)?.parentId ?? null,
    }));
  }

  async resolveBaseNodeIdsForSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<Set<number>> {
    const rows = (await this.manager
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('node')
      .select('node.systemId')
      .innerJoin(
        ENTITY_NAMES.SpfModule,
        'sm',
        'sm.system_id = node.system_id AND sm.subgraph_system_id = :subgraphSystemId',
        {subgraphSystemId},
      )
      .where('node.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as Array<{systemId: number}>;

    return new Set(rows.map(r => r.systemId));
  }

  async resolveBaseNodeIdsForUsecases(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<{nodeIds: Set<number>; subgraphIds: Set<number>}> {
    interface NodeSubgraphRaw {
      node_system_id: number;
      sm_subgraph_system_id: number;
    }

    const rows: NodeSubgraphRaw[] = await this.manager
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('node')
      .select(['node.systemId', 'sm.subgraphSystemId'])
      .innerJoin(ENTITY_NAMES.SpfModule, 'sm', 'sm.system_id = node.system_id')
      .innerJoin(
        ENTITY_NAMES.UseCaseSubgraph,
        'ucs',
        'ucs.subgraph_system_id = sm.subgraph_system_id AND ucs.usecase_system_id IN (:...ids)',
        {ids: usecaseSystemIds},
      )
      .where('node.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany();

    return {
      nodeIds: new Set(rows.map(r => r.node_system_id)),
      subgraphIds: new Set(rows.map(r => r.sm_subgraph_system_id)),
    };
  }

  async resolveNodeIdsForSubgraph(
    subgraphSystemId: number,
    nodeIds: Set<number>,
    sessionId: number,
  ): Promise<void> {
    const [spfCreates, nodeDeletes] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.SpfModule, {
        operations: ['CREATE'],
      }),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node, {
        operations: ['DELETE'],
      }),
    ]);

    for (const a of spfCreates) {
      const p = a.newValue as {subgraphSystemId?: number};
      if (a.targetSystemId && p.subgraphSystemId === subgraphSystemId)
        nodeIds.add(a.targetSystemId);
    }
    for (const a of nodeDeletes) nodeIds.delete(a.targetSystemId);
  }

  async resolveNodeIdsForUsecases(
    usecaseSystemIds: number[],
    subgraphIds: Set<number>,
    nodeIds: Set<number>,
    sessionId: number,
  ): Promise<void> {
    const [ucsActions, spfCreates, nodeDeletes] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UseCaseSubgraph),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.SpfModule, {
        operations: ['CREATE'],
      }),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Node, {
        operations: ['DELETE'],
      }),
    ]);

    for (const a of ucsActions) {
      const p = a.newValue as {
        usecaseSystemId?: number;
        subgraphSystemId?: number;
      };
      if (!p.subgraphSystemId || !usecaseSystemIds.includes(p.usecaseSystemId!))
        continue;
      if (a.operation === 'CREATE') subgraphIds.add(p.subgraphSystemId);
      if (a.operation === 'DELETE') subgraphIds.delete(p.subgraphSystemId);
    }

    for (const a of spfCreates) {
      const p = a.newValue as {subgraphSystemId?: number};
      if (
        a.targetSystemId &&
        p.subgraphSystemId &&
        subgraphIds.has(p.subgraphSystemId)
      ) {
        nodeIds.add(a.targetSystemId);
      }
    }

    for (const a of nodeDeletes) nodeIds.delete(a.targetSystemId);
  }
}
