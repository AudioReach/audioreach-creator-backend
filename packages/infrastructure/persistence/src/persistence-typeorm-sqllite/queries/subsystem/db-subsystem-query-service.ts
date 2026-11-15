/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {SubsystemQueryService, SubsystemReadModel} from '@arc/core';
import {Result, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {
  PortOverlayFetcher,
  type OverlaidControlPort,
  type OverlaidDataPort,
} from '../../fetchers/port-overlay-fetcher.js';
import type {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {NODE_TYPE} from '../../entity-schema/usecase-data/node/node.schema.js';
import type {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';

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
    private readonly linkFetcher: LinkOverlayFetcher,
    private readonly portFetcher: PortOverlayFetcher,
    private readonly keyValueDefinitionFetcher: KeyValueDefinitionFetcher,
  ) {}

  async findAll(
    fileSystemId: number,
    systemIds?: number[],
  ): Promise<Result<SubsystemReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource.manager,
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
          this.nodeFetcher.fetchAll(fileSystemId, sessionId),
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
      const childIdsByParent = new Map<
        number,
        {moduleSystemIds: number[]; subsystemSystemIds: number[]}
      >();
      for (const node of nodes) {
        if (node.parentSystemId === null) continue;
        const childIds = childIdsByParent.get(node.parentSystemId) ?? {
          moduleSystemIds: [],
          subsystemSystemIds: [],
        };
        if (node.type === NODE_TYPE.Module) {
          childIds.moduleSystemIds.push(node.systemId);
        } else if (node.type === NODE_TYPE.Subsystem) {
          childIds.subsystemSystemIds.push(node.systemId);
        }
        childIdsByParent.set(node.parentSystemId, childIds);
      }
      const filteredKeySystemIds = [
        ...new Set(
          selectedSubsystems.flatMap(
            subsystem => subsystem.filteredKeySystemIds,
          ),
        ),
      ];
      const filteredKeys = await this.keyValueDefinitionFetcher.fetchMany(
        filteredKeySystemIds,
        fileSystemId,
        sessionId,
      );
      const filteredKeyBySystemId = new Map(
        filteredKeys.map(key => [key.systemId, key]),
      );
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
            naturalId,
            name: subsystem.name,
            parentSystemId: node.parentSystemId,
            ...(childIdsByParent.get(subsystem.systemId) ?? {
              moduleSystemIds: [],
              subsystemSystemIds: [],
            }),
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
            filteredKeys: subsystem.filteredKeySystemIds.flatMap(systemId => {
              const key = filteredKeyBySystemId.get(systemId);
              return key === undefined
                ? []
                : [
                    {
                      systemId: key.systemId,
                      naturalId: key.naturalId,
                      name: key.name,
                      ...(key.description === undefined
                        ? {}
                        : {description: key.description}),
                    },
                  ];
            }),
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
}
