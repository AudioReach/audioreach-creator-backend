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
import {Result, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';

/**
 * Database implementation of SubsystemQueryService.
 *
 * Composes effective usecase membership, canonical links, and subsystem-link
 * segments provided by their respective fetchers.
 */
export class DbSubsystemQueryService implements SubsystemQueryService {
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly portFetcher: PortOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    subsystemFetcher: SubsystemOverlayFetcher,
    private readonly usecaseFetcher: UsecaseOverlayFetcher,
    private readonly linkFetcher: LinkOverlayFetcher,
    portFetcher: PortOverlayFetcher,
  ) {
    this.subsystemFetcher = subsystemFetcher;
    this.portFetcher = portFetcher;
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

      const data = await Promise.all(
        subsystems.map(async s => {
          const [dataPorts, controlPorts, childSubgraphs] = await Promise.all([
            this.portFetcher.fetchDataPorts(
              s.systemId,
              fileSystemId,
              sessionId,
            ),
            this.portFetcher.fetchControlPortsWithIntents(
              s.systemId,
              fileSystemId,
              sessionId,
            ),
            this.findDirectChildSubgraphIds(s.systemId, fileSystemId),
          ]);
          return {
            systemId: s.systemId,
            naturalId: s.subsystemId,
            name: s.name,
            parentSystemId: s.parentSystemId,
            subgraphSystemIds: childSubgraphs,
            filteredKeys: [], // TODO: load from SubsystemFilteredKey when filtered-by-subsystem is implemented
            dataPorts: dataPorts.map(port => ({
              systemId: port.systemId,
              naturalId: port.naturalId,
              name: port.name ?? '',
              portIoType: port.portIoType,
              isStatic: port.isStatic,
              totalLinksAtPort: 0,
            })),
            controlPorts: controlPorts.map(port => ({
              systemId: port.systemId,
              naturalId: port.naturalId,
              name: port.name ?? '',
              isStatic: port.isStatic,
              allocatedIntents: port.intents.map(intent => ({
                systemId: intent.systemId,
                naturalId: intent.naturalId,
                name: '',
              })),
              totalLinksAtPort: 0,
            })),
          };
        }),
      );
      return Result.ok(data);
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : 'Failed to load subsystems',
        ),
      );
    }
  }

  private async findDirectChildSubgraphIds(
    subsystemSystemId: number,
    fileSystemId: number,
  ): Promise<number[]> {
    const rows: Array<{subgraphSystemId: number}> =
      await this.dataSource.manager
        .createQueryBuilder()
        .select('m.subgraph_system_id', 'subgraphSystemId')
        .from('nodes', 'n')
        .innerJoin('spf_modules', 'm', 'm.system_id = n.system_id')
        .where('n.parent_id = :subsystemSystemId', {subsystemSystemId})
        .andWhere('n.file_system_id = :fileSystemId', {fileSystemId})
        .distinct(true)
        .getRawMany();
    return rows.map(row => Number(row.subgraphSystemId));
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

      const usecaseSubgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
      if (usecaseSubgraphIds.length === 0) return Result.ok([]);

      const [controlLinks, segments] = await Promise.all([
        this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
        this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
      ]);
      const usecaseSubgraphIdSet = new Set(usecaseSubgraphIds);
      const controlLinkBySystemId = new Map(
        controlLinks.map(link => [link.systemId, link]),
      );
      const links: ControlLinkBase[] = segments.flatMap(segment => {
        const link =
          segment.controlLinkSystemId === null
            ? undefined
            : controlLinkBySystemId.get(segment.controlLinkSystemId);
        if (
          link === undefined ||
          !this.isLinkInUsecaseScope(link, usecaseSubgraphIdSet)
        ) {
          return [];
        }
        return [
          {
            ...link,
            systemId: segment.systemId,
            peerNodeASystemId: segment.peerNodeASystemId,
            peerNodeBSystemId: segment.peerNodeBSystemId,
            nodeAPortSystemId: segment.nodeAPortSystemId,
            nodeBPortSystemId: segment.nodeBPortSystemId,
          },
        ];
      });
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

  async findDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      const usecaseSubgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
      if (usecaseSubgraphIds.length === 0) return Result.ok([]);

      const [dataLinks, segments] = await Promise.all([
        this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId),
        this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId),
      ]);
      const usecaseSubgraphIdSet = new Set(usecaseSubgraphIds);
      const dataLinkBySystemId = new Map(
        dataLinks.map(link => [link.systemId, link]),
      );
      const links: DataLinkBase[] = segments.flatMap(segment => {
        const link =
          segment.dataLinkSystemId === null
            ? undefined
            : dataLinkBySystemId.get(segment.dataLinkSystemId);
        if (
          link === undefined ||
          !this.isLinkInUsecaseScope(link, usecaseSubgraphIdSet)
        ) {
          return [];
        }
        return [
          {
            ...link,
            systemId: segment.systemId,
            sourceNodeSystemId: segment.sourceNodeSystemId,
            destinationNodeSystemId: segment.destinationNodeSystemId,
            sourcePortSystemId: segment.sourcePortSystemId,
            destinationPortSystemId: segment.destinationPortSystemId,
          },
        ];
      });
      return Result.ok(
        links.map(dl =>
          UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
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

  private isLinkInUsecaseScope(
    link: Pick<
      DataLinkBase | ControlLinkBase,
      'sourceSubgraphSystemId' | 'destSubgraphSystemId'
    >,
    usecaseSubgraphIds: ReadonlySet<number>,
  ): boolean {
    return (
      usecaseSubgraphIds.has(link.sourceSubgraphSystemId) ||
      usecaseSubgraphIds.has(link.destSubgraphSystemId)
    );
  }
}
