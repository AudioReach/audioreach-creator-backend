/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SubsystemQueryService,
  SubsystemReadModel,
  ControlLinkReadModel,
  DataLinkReadModel,
} from '@arc/core';
import {Result, IssueFactory, CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
// eslint-disable-next-line sonarjs/deprecation
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {
  SubsystemRow,
  ControlLinkRow,
  DataLinkRow,
  EditActionRow,
} from '../../entity-schema/index.js';
import {applyLinkOverlayAndMap} from '../shared/link-overlay-utils.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {NODE_TYPE} from '../../entity-schema/usecase-data/node/node.schema.js';

export class DbSubsystemQueryService implements SubsystemQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQuerySvc: EditActionsQueryService,
  ) {}

  async findAll(fileSystemId: number): Promise<Result<SubsystemReadModel[]>> {
    try {
      // Load subsystem rows joined to Node to get parentId.
      // filteredKeys are not loaded here — they are only used by the
      // filtered-by-subsystem endpoint which is not yet implemented.
      const rawRows = await this.dataSource
        .getRepository(ENTITY_NAMES.Subsystem)
        .createQueryBuilder('sub')
        .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = sub.system_id')
        .addSelect('n.parentId', 'parentId')
        .where('n.fileSystemId = :fileSystemId', {fileSystemId})
        .getRawAndEntities();

      // Extract parentId from raw results (parentId lives on Node, not Subsystem)
      const parentIdBySystemId = new Map(
        rawRows.raw.map((r: Record<string, unknown>) => [
          Number(r['sub_system_id']),
          r['parentId'] == null ? undefined : Number(r['parentId']),
        ]),
      );

      let rows = rawRows.entities as SubsystemRow[];

      // Overlay: subsystem row-level changes (name UPDATE, CREATE, DELETE)
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      if (session) {
        const subsystemActions = await this.editActionsQuerySvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.Subsystem,
        );
        if (subsystemActions.length > 0) {
          // eslint-disable-next-line sonarjs/deprecation
          rows = applyToCollection(rows, subsystemActions);
        }

        // Session-created subsystems have parentId in the Node CREATE action payload,
        // not in the Subsystem action (parentId lives on the Node table, not Subsystem).
        // Supplement the map for any systemId injected by the overlay that is not yet in it.
        const nodeActions = await this.editActionsQuerySvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.Node,
        );
        this.supplementParentIdsFromNodeActions(
          parentIdBySystemId,
          nodeActions,
        );
      }

      return Result.ok(
        rows.map(row => ({
          systemId: row.systemId,
          name: row.name,
          parentId: parentIdBySystemId.get(row.systemId),
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
   * Supplements `parentIdBySystemId` with parentId values from Node CREATE actions.
   * Session-created subsystems store their parentId on the Node action payload, not the
   * Subsystem action — this helper bridges that gap after the subsystem overlay is applied.
   */
  private supplementParentIdsFromNodeActions(
    parentIdBySystemId: Map<number, number | undefined>,
    nodeActions: EditActionRow[],
  ): void {
    for (const action of nodeActions) {
      if (
        action.operation !== CHANGE_OPERATION.Create ||
        action.fieldPath !== '$'
      )
        continue;
      const payload = action.newValue as Record<string, unknown>;
      if (
        payload.type === NODE_TYPE.Subsystem &&
        !parentIdBySystemId.has(action.targetSystemId)
      ) {
        parentIdBySystemId.set(
          action.targetSystemId,
          payload.parentId == null ? undefined : Number(payload.parentId),
        );
      }
    }
  }

  /**
   * Returns virtual control-link segments from subsystem_control_links for the given usecases.
   *
   * Virtual segments differ from raw control_links in that one endpoint may be a subsystem node
   * rather than a module, representing a boundary crossing:
   *   Outside segment: peerNodeA=M1 (module), peerNodeB=SS.systemId (subsystem boundary)
   *   Inside  segment: peerNodeA=SS.systemId (boundary), peerNodeB=M4 (module)
   * Both segments share the same controlLinkSystemId referencing the original raw link.
   *
   * Scoped via control_links → use_case_subgraph_pairs to match only in-scope links.
   * Overlay applied: edit_actions for SubsystemControlLink remove session-deleted segments.
   */
  async findControlLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      // Join subsystem_control_links with control_links to get link attributes (heapId, linkType, ports),
      // then scope to the requested usecases via use_case_subgraph_pairs.
      // DISTINCT prevents fan-out duplicates when a cross-usecase link matches multiple ucsp rows.
      // Typed as ControlLinkRow[] so the mapper receives typed rows (getRawMany returns any[]).
      const rows: ControlLinkRow[] = await this.dataSource
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
        .from('subsystem_control_links', 'scl')
        // Get link attributes (heapId, linkType, ports) from the original raw control link
        .innerJoin(
          'control_links',
          'cl',
          'cl.system_id = scl.control_link_system_id',
        )
        // Scope to usecases: include segment if either endpoint subgraph belongs to a requested usecase
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

      // Apply overlay: removes segments whose raw link was deleted in the active edit session
      return Result.ok(
        await applyLinkOverlayAndMap(
          rows,
          ENTITY_NAMES.SubsystemControlLink,
          session,
          this.editActionsQuerySvc,
          cl => UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
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
   * Includes dl.is_ec from data_links (required by DataLinkReadModel).
   */
  async findDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      // Join subsystem_data_links with data_links to get link attributes including isEc,
      // then scope to the requested usecases via use_case_subgraph_pairs.
      // DISTINCT prevents fan-out duplicates when a cross-usecase link matches multiple ucsp rows.
      // Typed as DataLinkRow[] so the mapper receives typed rows (getRawMany returns any[]).
      const rows: DataLinkRow[] = await this.dataSource
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
        .from('subsystem_data_links', 'sdl')
        // Get link attributes (linkType, isEc, subgraph IDs) from the original raw data link
        .innerJoin('data_links', 'dl', 'dl.system_id = sdl.data_link_system_id')
        // Scope to usecases: include segment if either endpoint subgraph belongs to a requested usecase
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

      // Apply overlay: removes segments whose raw link was deleted in the active edit session
      return Result.ok(
        await applyLinkOverlayAndMap(
          rows,
          ENTITY_NAMES.SubsystemDataLink,
          session,
          this.editActionsQuerySvc,
          dl => UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
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
}
