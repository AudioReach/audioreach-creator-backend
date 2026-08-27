/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  NodeBase,
  NodeRow,
} from '../entity-schema/usecase-data/node/node.schema.js';

/**
 * Fetcher for nodes rows and node-set management.
 * Owns the Node query, session overlay (CREATE/UPDATE/DELETE), and all
 * operations that resolve sets of node IDs from subgraph or usecase context.
 */
export class NodeOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  // ── Core entry point ─────────────────────────────────────────────────────────

  /**
   * Fetches Node rows for the given node IDs with session overlay applied.
   *
   * @param nodeSystemIds  Node PKs to fetch. Returns [] immediately if empty.
   * @param fileSystemId   File scope filter.
   * @param sessionId      Active session; null returns baseline only.
   */
  async fetchMany(
    nodeSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<NodeBase[]> {
    if (nodeSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository<NodeRow>(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .select(['n.systemId', 'n.parentId', 'n.fileSystemId'])
      .where('n.systemId IN (:...ids) AND n.fileSystemId = :fileSystemId', {
        ids: nodeSystemIds,
        fileSystemId,
      })
      .getMany()) as NodeBase[];

    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Node,
    );
    const nodeIdSet = new Set(nodeSystemIds);
    const actions = allActions.filter(a => nodeIdSet.has(a.targetSystemId));
    if (actions.length === 0) return baseRows;

    return this.overlay
      .applyToCollection(baseRows, actions)
      .map(r => r.effective);
  }
}
