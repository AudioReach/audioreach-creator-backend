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
import {
  NODE_TYPE,
  type NodeBase,
} from '../entity-schema/usecase-data/node/node.schema.js';

export interface OverlaidSpfModule extends SpfModuleBase {
  parentId: number | null;
}

export class ModuleNodeOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns the overlay-aware definitionSystemId for the given module, or null
   * if the module does not exist or was deleted in the session.
   *
   * Does not require fileSystemId — moduleSystemId is globally unique (auto-
   * increment PK), so a file-scope filter is unnecessary here.
   *
   * Used by getModuleDefinitionSystemId, which receives only the module system
   * ID and has no fileSystemId in scope. The definitionSystemId CAN change in
   * a session (e.g. a module is re-assigned to a different definition), so the
   * baseline-only query used previously was incorrect.
   */
  async getDefinitionSystemId(
    moduleSystemId: number,
    sessionId: number | null,
  ): Promise<number | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
      .select(['sm.systemId', 'sm.definitionSystemId'])
      .where('sm.systemId = :moduleSystemId', {moduleSystemId})
      .getOne()) as unknown as {
      systemId: number;
      definitionSystemId: number;
    } | null;

    if (sessionId === null) {
      return baseRow?.definitionSystemId ?? null;
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleSystemId,
    );
    const spfActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.SpfModule,
    );

    // DELETE in session — module no longer exists
    if (spfActions.some(a => a.operation === CHANGE_OPERATION.Delete)) {
      return null;
    }

    // CREATE in session — no baseline row; read definitionSystemId from payload
    const createAction = spfActions.find(
      a => a.operation === CHANGE_OPERATION.Create,
    );
    if (createAction && baseRow === null) {
      const p = createAction.newValue as {definitionSystemId?: number};
      return p.definitionSystemId ?? null;
    }

    // UPDATE in session — merge definitionSystemId if changed
    const updateAction = spfActions.find(
      a => a.operation === CHANGE_OPERATION.Update,
    );
    if (updateAction) {
      const p = updateAction.newValue as {definitionSystemId?: number};
      if (p.definitionSystemId !== undefined) return p.definitionSystemId;
    }

    return baseRow?.definitionSystemId ?? null;
  }

  async fetchOne(
    moduleSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSpfModule | null> {
    // Load base spf_module row
    const baseModuleRow = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
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
        ...baseModuleRow,
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
      ...overlaidModule,
      parentId: overlaidNode.parentId ?? null,
    };
  }

  async fetchOverLayedSpfModules(
    moduleSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSpfModule[]> {
    if (moduleSystemIds.length === 0) return [];

    const baseSpfRows = (await this.manager
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
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
        ...sm,
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
    // Exclude CREATE actions that also have a DELETE in the same session —
    // CREATE-then-DELETE collapses to "does not exist" (tombstoned).
    const deletedSpfIds = new Set(
      spfActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const createdSpf: SpfModuleBase[] = spfActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseSpfIds.has(a.targetSystemId) &&
          !deletedSpfIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SpfModuleBase>;
        return {
          systemId: a.targetSystemId,
          instanceId: p.instanceId ?? 0,
          alias: p.alias ?? null,
          definitionSystemId: p.definitionSystemId ?? 0,
          containerSystemId: p.containerSystemId ?? 0,
          subgraphSystemId: p.subgraphSystemId ?? 0,
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    const baseNodeIds = new Set(baseNodeRows.map(r => r.systemId));
    // Same CREATE-then-DELETE collapse for Node rows.
    const deletedNodeIds = new Set(
      nodeActions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const createdNode: NodeBase[] = nodeActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseNodeIds.has(a.targetSystemId) &&
          !deletedNodeIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<NodeBase>;
        return {
          systemId: a.targetSystemId,
          parentId: p.parentId,
          type: p.type ?? NODE_TYPE.Module,
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    const nodeMap = new Map(
      [...overlaidNode, ...createdNode].map(n => [n.systemId, n]),
    );
    return [...overlaidSpf, ...createdSpf].map(sm => ({
      ...sm,
      parentId: nodeMap.get(sm.systemId)?.parentId ?? null,
    }));
  }

  /**
   * Queries the baseline database for all module node system IDs that belong
   * to the given subgraph. No session overlay is applied — this returns the
   * committed set of nodes before any staged changes are considered.
   *
   * Callers typically follow this with applySessionOverlayToNodesForSubgraph
   * to incorporate any active-session CREATE/DELETE actions.
   */
  async loadBaselineNodeIdsForSubgraph(
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

  /**
   * Queries the baseline database for all module node system IDs reachable
   * from the given usecase system IDs (via use_case_subgraphs). Returns both
   * the node IDs and the subgraph IDs so callers can scope session overlay.
   * No session overlay is applied at this stage.
   *
   * Callers typically follow this with applySessionOverlayToNodesForUsecases
   * to incorporate any active-session CREATE/DELETE/UPDATE actions.
   */
  async loadBaselineNodeIdsForUsecases(
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

  /**
   * Mutates the given nodeIds set in-place by applying the active session's
   * CREATE and DELETE actions for the given subgraph.
   *
   * - SpfModule CREATE actions whose subgraphSystemId matches → add to nodeIds
   * - Node DELETE actions → remove from nodeIds
   *
   * Must be called after loadBaselineNodeIdsForSubgraph has populated nodeIds.
   */
  async applySessionOverlayToNodesForSubgraph(
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

  /**
   * Mutates both subgraphIds and nodeIds sets in-place by applying the active
   * session's CREATE and DELETE actions for the given usecases.
   *
   * - UseCaseSubgraph CREATE/DELETE → add/remove subgraph IDs in scope
   * - SpfModule CREATE actions in scope → add module node IDs
   * - Node DELETE actions → remove node IDs
   *
   * Must be called after loadBaselineNodeIdsForUsecases has populated both sets.
   */
  async applySessionOverlayToNodesForUsecases(
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
