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
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {NODE_TYPE} from '../../entity-schema/usecase-data/node/node.schema.js';

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
    private readonly nodeFetcher: NodeOverlayFetcher,
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
      const [subsystems, nodes] = await Promise.all([
        this.subsystemFetcher.fetchAll(fileSystemId, sessionId),
        this.nodeFetcher.fetchAll(fileSystemId, sessionId),
      ]);
      const childIdsByParent = new Map<
        number,
        {moduleSystemIds: number[]; subsystemSystemIds: number[]}
      >();
      for (const node of nodes) {
        const parentSystemId = node.parentSystemId;
        if (parentSystemId === null) continue;
        const childIds = childIdsByParent.get(parentSystemId) ?? {
          moduleSystemIds: [],
          subsystemSystemIds: [],
        };
        if (node.type === NODE_TYPE.Module) {
          childIds.moduleSystemIds.push(node.systemId);
        } else {
          childIds.subsystemSystemIds.push(node.systemId);
        }
        childIdsByParent.set(parentSystemId, childIds);
      }

      const subsystemData = await Promise.all(
        subsystems.map(async s => {
          const [dataPorts, controlPorts] = await Promise.all([
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
          ]);
          return {
            subsystem: s,
            ...(childIdsByParent.get(s.systemId) ?? {
              moduleSystemIds: [],
              subsystemSystemIds: [],
            }),
            dataPorts,
            controlPorts,
          };
        }),
      );

      const dataPortIds = subsystemData.flatMap(({dataPorts}) =>
        dataPorts.map(port => port.systemId),
      );
      const controlPortIds = subsystemData.flatMap(({controlPorts}) =>
        controlPorts.map(port => port.systemId),
      );
      const [dataLinks, controlLinks] = await Promise.all([
        dataPortIds.length > 0
          ? this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId, {
              $or: [
                {sourcePortSystemId: dataPortIds},
                {destinationPortSystemId: dataPortIds},
              ],
            })
          : Promise.resolve([] as DataLinkBase[]),
        controlPortIds.length > 0
          ? this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId, {
              $or: [
                {nodeAPortSystemId: controlPortIds},
                {nodeBPortSystemId: controlPortIds},
              ],
            })
          : Promise.resolve([] as ControlLinkBase[]),
      ]);
      const dataLinkCounts = this.countLinksPerPort(
        dataPortIds,
        dataLinks.map(
          link =>
            [link.sourcePortSystemId, link.destinationPortSystemId] as const,
        ),
      );
      const controlLinkCounts = this.countLinksPerPort(
        controlPortIds,
        controlLinks.map(
          link => [link.nodeAPortSystemId, link.nodeBPortSystemId] as const,
        ),
      );

      const data = subsystemData.map(
        ({
          subsystem: s,
          moduleSystemIds,
          subsystemSystemIds,
          dataPorts,
          controlPorts,
        }) => ({
          systemId: s.systemId,
          naturalId: s.subsystemId,
          name: s.name,
          parentSystemId: s.parentSystemId,
          moduleSystemIds,
          subsystemSystemIds,
          filteredKeys: [], // TODO: load from SubsystemFilteredKey when filtered-by-subsystem is implemented
          dataPorts: dataPorts.map(port => ({
            systemId: port.systemId,
            naturalId: port.naturalId,
            name: port.name ?? null,
            portIoType: port.portIoType,
            isStatic: port.isStatic,
            totalLinksAtPort: dataLinkCounts.get(port.systemId) ?? 0,
          })),
          controlPorts: controlPorts.map(port => ({
            systemId: port.systemId,
            naturalId: port.naturalId,
            name: port.name ?? null,
            isStatic: port.isStatic,
            allocatedIntents: port.intents.map(intent => ({
              systemId: intent.systemId,
              naturalId: intent.naturalId,
              name: '',
            })),
            totalLinksAtPort: controlLinkCounts.get(port.systemId) ?? 0,
          })),
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

  private countLinksPerPort(
    portSystemIds: number[],
    linkEndpoints: Array<readonly [number, number]>,
  ): Map<number, number> {
    const portIds = new Set(portSystemIds);
    const counts = new Map<number, number>();

    for (const [firstPortSystemId, secondPortSystemId] of linkEndpoints) {
      const endpoints = new Set([firstPortSystemId, secondPortSystemId]);
      for (const portSystemId of endpoints) {
        if (!portIds.has(portSystemId)) continue;
        counts.set(portSystemId, (counts.get(portSystemId) ?? 0) + 1);
      }
    }

    return counts;
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
