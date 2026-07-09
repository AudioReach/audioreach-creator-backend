/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import type {SgkvBase} from '../entity-schema/usecase-data/subgraph/subgraph-sgkv-data.js';

/**
 * Overlay fetcher for the Subgraph aggregate.
 *
 * Works on the scalar-column base types (SubgraphBase / SgkvBase /
 * SubgraphPropertyDataBase) — mirrors ModuleNodeOverlayFetcher which uses
 * SpfModuleBase. Relation fields (sgkvs, values, file, …) are not the
 * fetcher's concern; callers preserve and re-merge those from the original
 * loaded rows after the overlay is applied.
 *
 * CREATE handling: OverlayMergeImpl.applyToCollection spreads newValue into
 * the effective object but never injects targetSystemId as systemId — following
 * PortOverlayFetcher / ContainerOverlayFetcher, CREATE actions are handled
 * separately so systemId is taken from targetSystemId, not newValue.
 * Only non-CREATE actions are passed to OverlayMergeImpl, which avoids the
 * duplicate-entry / undefined-systemId problem that arises when the second
 * loop of applyToCollection would otherwise process CREATE rows.
 */
export class SubgraphOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(private readonly editActionsSvc: EditActionsQueryService) {}

  /**
   * Applies session overlay to a collection of pre-loaded Subgraph scalar rows.
   *
   * Uses getByTable — table-wide fetch covers all subgraphs in the session.
   * Callers pass SubgraphBase[] (or SubgraphRow[], which satisfies SubgraphBase).
   *
   * Handles:
   *   UPDATE  → scalar field changes merged onto the committed row
   *   DELETE  → tombstoned row excluded from result
   *   CREATE  → new subgraph injected with systemId = targetSystemId
   */
  async applyToSubgraphs(
    baseRows: SubgraphBase[],
    fileSystemId: number,
    sessionId: number,
  ): Promise<SubgraphBase[]> {
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );
    if (actions.length === 0) return baseRows;

    const baseIds = new Set(baseRows.map(r => r.systemId));

    // UPDATE + DELETE on committed rows — exclude CREATE so OverlayMergeImpl's
    // second loop (which would produce systemId:undefined for new entities)
    // is never triggered.
    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    // CREATE: session-staged subgraphs not yet in DB — inject targetSystemId
    const created: SubgraphBase[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SubgraphBase>;
        return {
          systemId: a.targetSystemId,
          subgraphId: p.subgraphId ?? 0,
          name: p.name ?? '',
          isExported: Boolean(p.isExported ?? false),
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    return [...overlaid, ...created];
  }

  /**
   * Applies session overlay to pre-loaded SubgraphPropertyData rows for one subgraph.
   *
   * Uses getByAggregateAndTable — single indexed scan scoped to the Subgraph
   * aggregate and SubgraphPropertyData table.
   *
   * Handles:
   *   UPDATE  → scalar field changes merged onto the committed row
   *   DELETE  → tombstoned property row excluded from result
   *   CREATE  → new property row injected with systemId = targetSystemId
   */
  async applyToPropertyRows(
    baseRows: SubgraphPropertyDataBase[],
    subgraphSystemId: number,
    sessionId: number,
  ): Promise<SubgraphPropertyDataBase[]> {
    const actions = await this.editActionsSvc.getByAggregateAndTable(
      sessionId,
      subgraphSystemId,
      ENTITY_NAMES.SubgraphPropertyData,
    );
    if (actions.length === 0) return baseRows;

    const baseIds = new Set(baseRows.map(r => r.systemId));

    // UPDATE + DELETE — exclude CREATE for same reason as applyToSubgraphs
    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    // CREATE: session-staged property rows — inject targetSystemId
    const created: SubgraphPropertyDataBase[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SubgraphPropertyDataBase>;
        return {
          systemId: a.targetSystemId,
          subgraphSystemId: p.subgraphSystemId ?? subgraphSystemId,
          subgraphPropertySystemId: p.subgraphPropertySystemId ?? 0,
          payload: p.payload ?? null,
        };
      });

    return [...overlaid, ...created];
  }

  /**
   * Applies session overlay to pre-loaded SGKV bin scalar rows for one subgraph.
   *
   * Uses getByAggregateAndTable — single indexed scan limited to the Sgkv
   * table for the given aggregate.
   *
   * Handles:
   *   UPDATE  → scalar field changes merged onto the committed row
   *   DELETE  → tombstoned bin excluded from result
   *   CREATE  → new SGKV bin injected with systemId = targetSystemId
   */
  async applyToSgkvRows(
    baseRows: SgkvBase[],
    subgraphSystemId: number,
    sessionId: number,
  ): Promise<SgkvBase[]> {
    const actions = await this.editActionsSvc.getByAggregateAndTable(
      sessionId,
      subgraphSystemId,
      ENTITY_NAMES.Sgkv,
    );
    if (actions.length === 0) return baseRows;

    const baseIds = new Set(baseRows.map(r => r.systemId));

    // UPDATE + DELETE — exclude CREATE for same reason as applyToSubgraphs
    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    // CREATE: session-staged SGKV bins — inject targetSystemId
    const created: SgkvBase[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SgkvBase>;
        return {
          systemId: a.targetSystemId,
          subgraphSystemId: p.subgraphSystemId ?? subgraphSystemId,
        };
      });

    return [...overlaid, ...created];
  }
}
