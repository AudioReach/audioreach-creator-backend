/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SubsystemQueryService,
  SubsystemReadModel,
  ControlLinkReadModel,
  SubsystemDataLinkReadModel,
} from '@arc/core';
import {Result, IssueFactory} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';

/**
 * Database implementation of SubsystemQueryService.
 *
 * Subsystem link segment queries (raw SQL cross-table JOINs) live here.
 * Standard link overlay delegated to LinkOverlayFetcher (FR-3).
 */
export class DbSubsystemQueryService implements SubsystemQueryService {
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly overlayMerge = new OverlayMergeImpl();

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQuerySvc: EditActionsQueryService,
  ) {
    this.subsystemFetcher = new SubsystemOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
  }

  async findAll(fileSystemId: number): Promise<Result<SubsystemReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const subsystems = await this.subsystemFetcher.fetchAll(
        fileSystemId,
        sessionId,
      );

      return Result.ok(
        subsystems.map(s => ({
          systemId: s.systemId,
          name: s.name,
          parentId: s.parentId,
          filteredKeys: [], // TODO: load from SubsystemFilteredKey when filtered-by-subsystem is implemented
        })),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : 'Failed to load subsystems',
        ),
      );
    }
  }

  /**
   * Returns virtual control-link segments from subsystem_control_links for
   * the given usecases. One endpoint may be a subsystem node rather than a
   * module, representing a boundary crossing. Overlay applied via
   * LinkOverlayFetcher (FR-3).
   */
  async findControlLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Raw SQL cross-table query: subsystem_control_links JOIN control_links
      const baseRows: ControlLinkBase[] = await this.dataSource.manager
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

      let rows: ControlLinkBase[];
      if (sessionId !== null) {
        const actions = await this.editActionsQuerySvc.getByTable(
          sessionId,
          ENTITY_NAMES.SubsystemControlLink,
        );
        rows =
          actions.length > 0
            ? this.overlayMerge
                .applyToCollection(baseRows, actions)
                .map(r => r.effective)
            : baseRows;
      } else {
        rows = baseRows;
      }

      const seen = new Set<number>();
      const links = rows.filter(
        r => !seen.has(r.systemId) && seen.add(r.systemId),
      );
      return Result.ok(
        links.map(cl =>
          UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subsystem control link segments',
        ),
      );
    }
  }

  /**
   * Returns virtual data-link segments from subsystem_data_links for the given usecases.
   * Same scoping and overlay pattern as findControlLinkSegmentsByUsecaseIds.
   * Returns SubsystemDataLinkReadModel (not DataLinkReadModel) so callers get the
   * dataLinkSystemId parent reference and the correct type.
   */
  async findDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SubsystemDataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Raw SQL cross-table query: subsystem_data_links JOIN data_links
      const baseRows: DataLinkBase[] = await this.dataSource.manager
        .createQueryBuilder()
        .distinct(true)
        .select([
          'sdl.system_id                  AS "systemId"',
          'sdl.source_node_system_id      AS "sourceNodeSystemId"',
          'sdl.destination_node_system_id AS "destinationNodeSystemId"',
          'sdl.source_port_system_id      AS "sourcePortSystemId"',
          'sdl.destination_port_system_id AS "destinationPortSystemId"',
          'dl.system_id                   AS "dataLinkSystemId"',
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

      let rows: DataLinkBase[];
      if (sessionId !== null) {
        const actions = await this.editActionsQuerySvc.getByTable(
          sessionId,
          ENTITY_NAMES.SubsystemDataLink,
        );
        rows =
          actions.length > 0
            ? this.overlayMerge
                .applyToCollection(baseRows, actions)
                .map(r => r.effective)
            : baseRows;
      } else {
        rows = baseRows;
      }

      const seen = new Set<number>();
      const links = rows.filter(
        r => !seen.has(r.systemId) && seen.add(r.systemId),
      );
      return Result.ok(
        links.map(dl =>
          UseCaseQueryMappers.mapToSubsystemDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subsystem data link segments',
        ),
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────
}
