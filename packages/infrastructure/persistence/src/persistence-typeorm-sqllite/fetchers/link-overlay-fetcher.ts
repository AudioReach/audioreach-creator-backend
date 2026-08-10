/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION, LINK_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import type {EntityName} from '../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import type {ControlLinkBase} from '../entity-schema/usecase-data/Links/control-link.js';
import type {
  DataLinkBase,
  LinkOverlayEntry,
} from '../entity-schema/usecase-data/Links/data-link.js';

/**
 * Internal fetcher — applies session edit_actions overlay to data and control links.
 * Not exported from @arc/persistence; shared between edit repos only.
 *
 * Overlay semantics:
 *   CREATE  → new link included if its src or dst port is in the requested portSystemIds
 *   DELETE  → base link excluded (tombstoned)
 *   UPDATE on links is not a LLD2 operation; UPDATE actions are ignored here
 *
 * Also provides subgraph/usecase-scoped methods (fetchControlLinksByUsecaseIds,
 * fetchControlLinksBySubgraphId) that return full ControlLinkBase rows for
 * read model assembly — these are distinct from the port-counting entry points
 * which return only {linkSystemId, portSystemId} pairs.
 */
export class LinkOverlayFetcher {
  private readonly overlayMerge = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all data links that involve the given subgraph — both as source
   * and as destination. Covers INTRA_SUBGRAPH links contained within the
   * subgraph and INTRA_USECASE links originating from or arriving at it.
   */
  async fetchDataLinksBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<DataLinkBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .where(
        '(dl.sourceSubgraphSystemId = :subgraphId OR dl.destSubgraphSystemId = :subgraphId)',
        {subgraphId},
      )
      .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as DataLinkBase[];

    return this.applyDataLinkOverlay(baseRows, fileSystemId, sessionId);
  }

  /**
   * Returns all data links whose endpoints fall within the subgraphs of the
   * given usecases. Two link types (INTRA_SUBGRAPH + INTRA_USECASE) are loaded
   * in two parallel baseline queries, merged, deduplicated, then overlaid.
   */
  async fetchDataLinksByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<DataLinkBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const [intraSubgraph, intraUsecase] = await Promise.all([
      this.manager
        .getRepository(ENTITY_NAMES.DataLink)
        .createQueryBuilder('dl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraph,
          'ucs',
          'ucs.subgraph_system_id = dl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
          {ids: usecaseSystemIds},
        )
        .where('dl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany(),
      this.manager
        .getRepository(ENTITY_NAMES.DataLink)
        .createQueryBuilder('dl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraphPair,
          'ucsp',
          'ucsp.source_subgraph_system_id = dl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = dl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
          {ids: usecaseSystemIds},
        )
        .where('dl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
        .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany(),
    ]);

    const merged = [
      ...intraSubgraph,
      ...intraUsecase,
    ] as unknown as DataLinkBase[];
    return this.applyDataLinkOverlay(merged, fileSystemId, sessionId);
  }

  private async applyDataLinkOverlay(
    baseRows: DataLinkBase[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<DataLinkBase[]> {
    let allRows: DataLinkBase[];

    if (sessionId === null) {
      allRows = baseRows;
    } else {
      const actions = await this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.DataLink,
      );

      const updateDeleteActions = actions.filter(
        a => a.operation !== CHANGE_OPERATION.Create,
      );
      const overlaid =
        actions.length > 0
          ? this.overlayMerge
              .applyToCollection(baseRows, updateDeleteActions)
              .map(r => r.effective)
          : baseRows;

      const baseIds = new Set(baseRows.map(r => r.systemId));
      const created: DataLinkBase[] = actions
        .filter(
          (a: EditActionRow) =>
            a.operation === CHANGE_OPERATION.Create &&
            !baseIds.has(a.targetSystemId),
        )
        .map((a: EditActionRow) => {
          const p = a.newValue as Partial<DataLinkBase>;
          return {
            systemId: a.targetSystemId,
            fileSystemId: p.fileSystemId ?? fileSystemId,
            sourceNodeSystemId: p.sourceNodeSystemId ?? 0,
            destinationNodeSystemId: p.destinationNodeSystemId ?? 0,
            sourcePortSystemId: p.sourcePortSystemId ?? 0,
            destinationPortSystemId: p.destinationPortSystemId ?? 0,
            linkType: p.linkType ?? LINK_TYPE.IntraSubgraph,
            sourceSubgraphSystemId: p.sourceSubgraphSystemId ?? 0,
            destSubgraphSystemId: p.destSubgraphSystemId ?? 0,
            isEc: p.isEc ?? null,
          };
        });

      allRows = [...overlaid, ...created];
    }

    const seen = new Set<number>();
    return allRows.filter(r => !seen.has(r.systemId) && seen.add(r.systemId));
  }

  /**
   * Returns virtual control-link boundary segments from subsystem_control_links
   * for the given usecases with session overlay applied.
   *
   * The JOIN to control_links is required to pick up heapId and linkType — those
   * columns are on control_links, not on subsystem_control_links. The JOIN to
   * use_case_subgraph_pairs scopes the result to the requested usecases.
   * DISTINCT prevents fan-out duplicates when a link matches multiple ucsp rows.
   *
   * Session overlay removes segments whose underlying raw link was deleted.
   */
  async fetchSubsystemControlLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ControlLinkBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows: ControlLinkBase[] = await this.manager
      .createQueryBuilder()
      .distinct(true)
      .select([
        'scl.system_id            AS "systemId"',
        'scl.peer_nodeA_system_id AS "peerNodeASystemId"',
        'scl.peer_nodeB_system_id AS "peerNodeBSystemId"',
        'scl.nodeA_port_system_id AS "nodeAPortSystemId"',
        'scl.nodeB_port_system_id AS "nodeBPortSystemId"',
        'cl.heap_id               AS "heapId"',
        'cl.link_type             AS "linkType"',
        'cl.source_subgraph_system_id AS "sourceSubgraphSystemId"',
        'cl.dest_subgraph_system_id   AS "destSubgraphSystemId"',
      ])
      .addSelect(`${JSON.stringify(fileSystemId)}`, '"fileSystemId"')
      .from('subsystem_control_links', 'scl')
      .innerJoin(
        'control_links',
        'cl',
        'cl.system_id = scl.control_link_system_id',
      )
      .innerJoin(
        'use_case_subgraph_pairs',
        'ucsp',
        'ucsp.subgraph_system_id = cl.source_subgraph_system_id OR ucsp.subgraph_system_id = cl.dest_subgraph_system_id',
      )
      .where('ucsp.use_case_system_id IN (:...usecaseSystemIds)', {
        usecaseSystemIds,
      })
      .andWhere('scl.file_system_id = :fileSystemId', {fileSystemId})
      .getRawMany();

    return this.applySubsystemLinkOverlay(
      baseRows,
      fileSystemId,
      sessionId,
      ENTITY_NAMES.SubsystemControlLink,
    );
  }

  /**
   * Returns virtual data-link boundary segments from subsystem_data_links for
   * the given usecases with session overlay applied. Same pattern as
   * fetchSubsystemControlLinkSegmentsByUsecaseIds.
   */
  async fetchSubsystemDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<DataLinkBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const baseRows: DataLinkBase[] = await this.manager
      .createQueryBuilder()
      .distinct(true)
      .select([
        'sdl.system_id                  AS "systemId"',
        'sdl.source_node_system_id      AS "sourceNodeSystemId"',
        'sdl.destination_node_system_id AS "destinationNodeSystemId"',
        'sdl.source_port_system_id      AS "sourcePortSystemId"',
        'sdl.destination_port_system_id AS "destinationPortSystemId"',
        'dl.link_type                   AS "linkType"',
        'dl.is_ec                       AS "isEc"',
        'dl.source_subgraph_system_id   AS "sourceSubgraphSystemId"',
        'dl.dest_subgraph_system_id     AS "destSubgraphSystemId"',
      ])
      .addSelect(`${JSON.stringify(fileSystemId)}`, '"fileSystemId"')
      .from('subsystem_data_links', 'sdl')
      .innerJoin('data_links', 'dl', 'dl.system_id = sdl.data_link_system_id')
      .innerJoin(
        'use_case_subgraph_pairs',
        'ucsp',
        'ucsp.subgraph_system_id = dl.source_subgraph_system_id OR ucsp.subgraph_system_id = dl.dest_subgraph_system_id',
      )
      .where('ucsp.use_case_system_id IN (:...usecaseSystemIds)', {
        usecaseSystemIds,
      })
      .andWhere('sdl.file_system_id = :fileSystemId', {fileSystemId})
      .getRawMany();

    return this.applySubsystemDataLinkOverlay(
      baseRows,
      fileSystemId,
      sessionId,
    );
  }

  /**
   * Applies session overlay to subsystem control link segment rows and
   * deduplicates by systemId.
   */
  private async applySubsystemLinkOverlay(
    baseRows: ControlLinkBase[],
    fileSystemId: number,
    sessionId: number | null,
    entityName: EntityName,
  ): Promise<ControlLinkBase[]> {
    if (sessionId === null) return this.dedup(baseRows);

    const actions = await this.editActionsSvc.getByTable(sessionId, entityName);
    if (actions.length === 0) return this.dedup(baseRows);

    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlayMerge
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: ControlLinkBase[] = actions
      .filter(
        (a: EditActionRow) =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map((a: EditActionRow) => {
        const p = a.newValue as Partial<ControlLinkBase>;
        return {
          systemId: a.targetSystemId,
          fileSystemId: p.fileSystemId ?? fileSystemId,
          peerNodeASystemId: p.peerNodeASystemId ?? 0,
          peerNodeBSystemId: p.peerNodeBSystemId ?? 0,
          nodeAPortSystemId: p.nodeAPortSystemId ?? 0,
          nodeBPortSystemId: p.nodeBPortSystemId ?? 0,
          heapId: p.heapId ?? 0,
          linkType: p.linkType ?? LINK_TYPE.IntraSubgraph,
          sourceSubgraphSystemId: p.sourceSubgraphSystemId ?? 0,
          destSubgraphSystemId: p.destSubgraphSystemId ?? 0,
        };
      });

    return this.dedup([...overlaid, ...created]);
  }

  private async applySubsystemDataLinkOverlay(
    baseRows: DataLinkBase[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<DataLinkBase[]> {
    if (sessionId === null) return this.dedup(baseRows);

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SubsystemDataLink,
    );
    if (actions.length === 0) return this.dedup(baseRows);

    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlayMerge
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: DataLinkBase[] = actions
      .filter(
        (a: EditActionRow) =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map((a: EditActionRow) => {
        const p = a.newValue as Partial<DataLinkBase>;
        return {
          systemId: a.targetSystemId,
          fileSystemId: p.fileSystemId ?? fileSystemId,
          sourceNodeSystemId: p.sourceNodeSystemId ?? 0,
          destinationNodeSystemId: p.destinationNodeSystemId ?? 0,
          sourcePortSystemId: p.sourcePortSystemId ?? 0,
          destinationPortSystemId: p.destinationPortSystemId ?? 0,
          linkType: p.linkType ?? LINK_TYPE.IntraSubgraph,
          sourceSubgraphSystemId: p.sourceSubgraphSystemId ?? 0,
          destSubgraphSystemId: p.destSubgraphSystemId ?? 0,
          isEc: p.isEc ?? null,
        };
      });

    return this.dedup([...overlaid, ...created]);
  }

  /** Deduplicates an array by systemId — preserves first occurrence. */
  private dedup<T extends {systemId: number}>(rows: T[]): T[] {
    const seen = new Set<number>();
    return rows.filter(r => !seen.has(r.systemId) && seen.add(r.systemId));
  }

  /**
   * Returns all control links that involve the given subgraph — both as source
   * and as destination. Covers:
   *   - INTRA_SUBGRAPH links contained entirely within the subgraph
   *   - INTRA_USECASE links originating from or arriving at the subgraph
   *
   * Session overlay applied (CREATE/UPDATE/DELETE on control_links).
   */
  async fetchControlLinksBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ControlLinkBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .where(
        '(cl.sourceSubgraphSystemId = :subgraphId OR cl.destSubgraphSystemId = :subgraphId)',
        {subgraphId},
      )
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as ControlLinkBase[];

    return this.applyControlLinkOverlay(baseRows, fileSystemId, sessionId);
  }

  /**
   * Returns all control links whose endpoints fall within the subgraphs of the
   * given usecases. Two link types are covered:
   *   - INTRA_SUBGRAPH — both endpoints in the same subgraph (UseCaseSubgraph JOIN)
   *   - INTRA_USECASE  — endpoints span two subgraphs of the same usecase
   *                      (UseCaseSubgraphPair JOIN)
   *
   * Two baseline queries run in parallel (fixed count, not per-usecase — FR-5).
   * Results are merged, deduplicated by systemId, then session overlay applied.
   */
  async fetchControlLinksByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ControlLinkBase[]> {
    if (usecaseSystemIds.length === 0) return [];

    const [intraSubgraph, intraUsecase] = await Promise.all([
      this.manager
        .getRepository(ENTITY_NAMES.ControlLink)
        .createQueryBuilder('cl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraph,
          'ucs',
          'ucs.subgraph_system_id = cl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
          {ids: usecaseSystemIds},
        )
        .where('cl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany(),
      this.manager
        .getRepository(ENTITY_NAMES.ControlLink)
        .createQueryBuilder('cl')
        .innerJoin(
          ENTITY_NAMES.UseCaseSubgraphPair,
          'ucsp',
          'ucsp.source_subgraph_system_id = cl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = cl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
          {ids: usecaseSystemIds},
        )
        .where('cl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
        .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany(),
    ]);

    const merged = [
      ...intraSubgraph,
      ...intraUsecase,
    ] as unknown as ControlLinkBase[];
    return this.applyControlLinkOverlay(merged, fileSystemId, sessionId);
  }

  /**
   * Applies session overlay to a set of control link base rows, appends
   * session-only CREATE'd links, deduplicates by systemId, and returns
   * ControlLinkBase[].
   *
   * One getByTable call covers all ControlLink session actions.
   */
  private async applyControlLinkOverlay(
    baseRows: ControlLinkBase[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ControlLinkBase[]> {
    let allRows: ControlLinkBase[];

    if (sessionId === null) {
      allRows = baseRows;
    } else {
      const actions = await this.editActionsSvc.getByTable(
        sessionId,
        ENTITY_NAMES.ControlLink,
      );

      const updateDeleteActions = actions.filter(
        a => a.operation !== CHANGE_OPERATION.Create,
      );
      const overlaid =
        actions.length > 0
          ? this.overlayMerge
              .applyToCollection(baseRows, updateDeleteActions)
              .map(r => r.effective)
          : baseRows;

      const baseIds = new Set(baseRows.map(r => r.systemId));
      const created: ControlLinkBase[] = actions
        .filter(
          (a: EditActionRow) =>
            a.operation === CHANGE_OPERATION.Create &&
            !baseIds.has(a.targetSystemId),
        )
        .map((a: EditActionRow) => {
          const p = a.newValue as Partial<ControlLinkBase>;
          return {
            systemId: a.targetSystemId,
            fileSystemId: p.fileSystemId ?? fileSystemId,
            peerNodeASystemId: p.peerNodeASystemId ?? 0,
            peerNodeBSystemId: p.peerNodeBSystemId ?? 0,
            nodeAPortSystemId: p.nodeAPortSystemId ?? 0,
            nodeBPortSystemId: p.nodeBPortSystemId ?? 0,
            heapId: p.heapId ?? 0,
            linkType: p.linkType ?? LINK_TYPE.IntraSubgraph,
            sourceSubgraphSystemId: p.sourceSubgraphSystemId ?? 0,
            destSubgraphSystemId: p.destSubgraphSystemId ?? 0,
          };
        });

      allRows = [...overlaid, ...created];
    }

    // Deduplicate by systemId — the two usecase queries may return the same link.
    const seen = new Set<number>();
    return allRows.filter(r => !seen.has(r.systemId) && seen.add(r.systemId));
  }

  async fetchDataLinks(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<LinkOverlayEntry[]> {
    if (portSystemIds.length === 0) return [];
    const base = await this.loadBaseDataLinks(portSystemIds, fileSystemId);
    if (sessionId === null) return base;
    return this.applyOverlay(
      base,
      sessionId,
      portSystemIds,
      ENTITY_NAMES.DataLink,
      'sourcePortSystemId',
      'destinationPortSystemId',
    );
  }

  async fetchControlLinks(
    portSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<LinkOverlayEntry[]> {
    if (portSystemIds.length === 0) return [];
    const base = await this.loadBaseControlLinks(portSystemIds, fileSystemId);
    if (sessionId === null) return base;
    return this.applyOverlay(
      base,
      sessionId,
      portSystemIds,
      ENTITY_NAMES.ControlLink,
      'nodeAPortSystemId',
      'nodeBPortSystemId',
    );
  }

  private async loadBaseDataLinks(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<LinkOverlayEntry[]> {
    // Do NOT join data_ports — a port may be staged (only in edit_actions, not yet in data_ports).
    // The caller already has the portSystemIds from the overlay-aware PortOverlayFetcher, so they
    // are authoritative. We query data_links directly and match in memory.
    const rows = await this.manager
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .select('dl.systemId', 'linkSystemId')
      .addSelect('dl.sourcePortSystemId', 'srcPort')
      .addSelect('dl.destinationPortSystemId', 'dstPort')
      .where(
        '(dl.sourcePortSystemId IN (:...portSystemIds) OR dl.destinationPortSystemId IN (:...portSystemIds))',
        {portSystemIds},
      )
      .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{linkSystemId: number; srcPort: number; dstPort: number}>();
    const portSet = new Set(portSystemIds);
    const entries: LinkOverlayEntry[] = [];
    for (const row of rows) {
      if (portSet.has(Number(row.srcPort)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.srcPort),
        });
      if (portSet.has(Number(row.dstPort)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.dstPort),
        });
    }
    return entries;
  }

  private async loadBaseControlLinks(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<LinkOverlayEntry[]> {
    // Same pattern as loadBaseDataLinks — no join with control_ports.
    const rows = await this.manager
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .select('cl.systemId', 'linkSystemId')
      .addSelect('cl.nodeAPortSystemId', 'portA')
      .addSelect('cl.nodeBPortSystemId', 'portB')
      .where(
        '(cl.nodeAPortSystemId IN (:...portSystemIds) OR cl.nodeBPortSystemId IN (:...portSystemIds))',
        {portSystemIds},
      )
      .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{linkSystemId: number; portA: number; portB: number}>();
    const portSet = new Set(portSystemIds);
    const entries: LinkOverlayEntry[] = [];
    for (const row of rows) {
      if (portSet.has(Number(row.portA)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.portA),
        });
      if (portSet.has(Number(row.portB)))
        entries.push({
          linkSystemId: Number(row.linkSystemId),
          portSystemId: Number(row.portB),
        });
    }
    return entries;
  }

  private async applyOverlay(
    base: LinkOverlayEntry[],
    sessionId: number,
    portSystemIds: number[],
    targetTable: EntityName,
    srcCol: string,
    dstCol: string,
  ): Promise<LinkOverlayEntry[]> {
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      targetTable,
    );
    const deleted = new Set(
      actions
        .filter(a => a.operation === CHANGE_OPERATION.Delete)
        .map(a => a.targetSystemId),
    );
    const portIdSet = new Set(portSystemIds);
    const result = base.filter(r => !deleted.has(r.linkSystemId));
    for (const action of actions.filter(
      a => a.operation === CHANGE_OPERATION.Create,
    )) {
      const payload = action.newValue as Record<string, number | undefined>;
      for (const portId of [payload[srcCol], payload[dstCol]]) {
        if (portId !== undefined && portIdSet.has(portId)) {
          result.push({
            linkSystemId: action.targetSystemId,
            portSystemId: portId,
          });
        }
      }
    }
    return result;
  }
}
