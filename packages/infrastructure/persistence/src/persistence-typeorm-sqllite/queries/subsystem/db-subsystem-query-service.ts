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
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {
  PortOverlayFetcher,
  type OverlaidControlPort,
  type OverlaidDataPort,
} from '../../fetchers/port-overlay-fetcher.js';
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
  constructor(
    private readonly dataSource: DataSource,
    private readonly subsystemFetcher: SubsystemOverlayFetcher,
    private readonly nodeFetcher: NodeOverlayFetcher,
    private readonly portFetcher: PortOverlayFetcher,
    private readonly usecaseFetcher: UsecaseOverlayFetcher,
    private readonly linkFetcher: LinkOverlayFetcher,
  ) {}

  async findAll(
    fileSystemId: number,
    systemIds?: number[],
  ): Promise<Result<SubsystemReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const subsystems = await this.subsystemFetcher.fetchAll(
        fileSystemId,
        sessionId,
      );

      const selectedSubsystems =
        systemIds === undefined
          ? subsystems
          : subsystems.filter(s => systemIds.includes(s.systemId));

      const missingNaturalId = selectedSubsystems.find(
        subsystem => subsystem.subsystemId == null,
      );
      if (missingNaturalId) {
        return Result.fail(
          IssueFactory.dbError(
            `Subsystem ${missingNaturalId.systemId} is missing its natural ID`,
          ),
        );
      }

      const subsystemSystemIds = selectedSubsystems.map(s => s.systemId);
      if (subsystemSystemIds.length === 0) return Result.ok([]);

      const [nodes, dataPorts, controlPorts, dataSegments, controlSegments] =
        await Promise.all([
          this.nodeFetcher.fetchMany(
            subsystemSystemIds,
            fileSystemId,
            sessionId,
          ),
          this.portFetcher.fetchDataPortsForNodes(
            subsystemSystemIds,
            fileSystemId,
            sessionId,
          ),
          this.portFetcher.fetchControlPortsWithIntentsForNodes(
            subsystemSystemIds,
            fileSystemId,
            sessionId,
          ),
          this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId),
          this.linkFetcher.loadSubsystemControlLinkRows(
            fileSystemId,
            sessionId,
          ),
        ]);

      const nodeBySystemId = new Map(nodes.map(node => [node.systemId, node]));
      const dataPortsByNode = this.groupPortsByNode(dataPorts);
      const controlPortsByNode = this.groupPortsByNode(controlPorts);
      const dataLinkCounts = this.countPortReferences(
        dataSegments.map(segment => [
          segment.sourcePortSystemId,
          segment.destinationPortSystemId,
        ]),
      );
      const controlLinkCounts = this.countPortReferences(
        controlSegments.map(segment => [
          segment.nodeAPortSystemId,
          segment.nodeBPortSystemId,
        ]),
      );

      return Result.ok(
        selectedSubsystems.map(subsystem => {
          const naturalId = subsystem.subsystemId;
          if (naturalId == null) {
            throw new Error(
              `Subsystem ${subsystem.systemId} is missing its natural ID`,
            );
          }
          const node = nodeBySystemId.get(subsystem.systemId);
          if (!node) {
            throw new Error(
              `Node ${subsystem.systemId} is missing for subsystem`,
            );
          }

          return {
            systemId: subsystem.systemId,
            subsystemNaturalId: naturalId,
            name: subsystem.name,
            parentSystemId: node.parentSystemId,
            dataPorts: (dataPortsByNode.get(subsystem.systemId) ?? []).map(
              port => ({
                systemId: port.systemId,
                naturalId: port.naturalId,
                name: port.name ?? '',
                portIoType: port.portIoType,
                isStatic: port.isStatic,
                totalLinksAtPort: dataLinkCounts.get(port.systemId) ?? 0,
              }),
            ),
            controlPorts: (
              controlPortsByNode.get(subsystem.systemId) ?? []
            ).map(port => ({
              systemId: port.systemId,
              naturalId: port.naturalId,
              name: port.name ?? '',
              isStatic: port.isStatic,
              allocatedIntents: port.intents.map(intent => ({
                systemId: intent.systemId,
                naturalId: intent.naturalId,
                name: `Intent_${intent.naturalId}`,
              })),
              totalLinksAtPort: controlLinkCounts.get(port.systemId) ?? 0,
            })),
            filteredKeys: [],
            filteredKeySystemIds: subsystem.filteredKeySystemIds,
          };
        }),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : 'Failed to load subsystems',
        ),
      );
    }
  }

  private groupPortsByNode<
    TPort extends OverlaidDataPort | OverlaidControlPort,
  >(ports: TPort[]): Map<number, TPort[]> {
    const portsByNode = new Map<number, TPort[]>();
    for (const port of ports) {
      const nodePorts = portsByNode.get(port.nodeSystemId) ?? [];
      nodePorts.push(port);
      portsByNode.set(port.nodeSystemId, nodePorts);
    }
    return portsByNode;
  }

  private countPortReferences(portPairs: number[][]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const pair of portPairs) {
      for (const portSystemId of new Set(pair)) {
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
