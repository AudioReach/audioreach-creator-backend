/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';
import {SubsystemDataLink} from '../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {DataLinkRepository} from '../../../ports/persistence/repositories/data-link/data-link.repository.js';
import type {ControlLinkRepository} from '../../../ports/persistence/repositories/control-link/control-link.repository.js';
import type {
  SubsystemNodeTopology,
  SubsystemRepository,
} from '../../../ports/persistence/repositories/subsystem/subsystem.repository.js';

export type MoveComponent = {
  systemId: number;
  parentSystemId: number | null;
};

export type SubsystemPortChange = {
  systemId: number;
  addedDataPorts: DataPort[];
  removedDataPorts: number[];
  addedControlPorts: ControlPort[];
  removedControlPorts: number[];
};

export type MoveSubsystemImpact = {
  addedDataLinks: DataLink[];
  removedDataLinks: number[];
  addedControlLinks: ControlLink[];
  removedControlLinks: number[];
  subsystemPortChanges: SubsystemPortChange[];
};

type MoveImpactDependencies = {
  subsystemRepository: SubsystemRepository;
  dataLinkRepository: DataLinkRepository;
  controlLinkRepository: ControlLinkRepository;
  idGeneration: IdGenerationPort;
};

type RouteState = {
  nodeSequence: number[];
  requiredPortType: Map<
    number,
    typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
  >;
};

type DataRouteChange = {
  link: DataLink;
  oldSegments: SubsystemDataLink[];
  newSegments: SubsystemDataLink[];
};

type ControlRouteChange = {
  link: ControlLink;
  oldSegments: SubsystemControlLink[];
  newSegments: SubsystemControlLink[];
};

function routeSignature(route: RouteState): string {
  return route.nodeSequence.join(':');
}

function getRoute(
  sourceNodeId: number,
  destinationNodeId: number,
  parentByNode: Map<number, number | null>,
): RouteState {
  return SubsystemBoundaryPathService.compute({
    sourceNodeSystemId: sourceNodeId,
    destinationNodeSystemId: destinationNodeId,
    nodeParentMap: parentByNode,
  });
}

function nextPortId(ports: readonly {naturalId: number}[]): number {
  let max = 0;
  for (const port of ports) max = Math.max(max, port.naturalId);
  return max + 1;
}

function getOrCreatePortChange(
  changes: Map<number, SubsystemPortChange>,
  systemId: number,
): SubsystemPortChange {
  const existing = changes.get(systemId);
  if (existing) return existing;
  const created: SubsystemPortChange = {
    systemId,
    addedDataPorts: [],
    removedDataPorts: [],
    addedControlPorts: [],
    removedControlPorts: [],
  };
  changes.set(systemId, created);
  return created;
}

function collectDataPortIds(
  segments: readonly SubsystemDataLink[],
  subsystemIds: ReadonlySet<number>,
): Set<number> {
  const ids = new Set<number>();
  for (const segment of segments) {
    if (subsystemIds.has(segment.sourceNodeSystemId))
      ids.add(segment.sourcePortSystemId);
    if (subsystemIds.has(segment.destinationNodeSystemId))
      ids.add(segment.destinationPortSystemId);
  }
  return ids;
}

function collectControlPortIds(
  segments: readonly SubsystemControlLink[],
  subsystemIds: ReadonlySet<number>,
): Set<number> {
  const ids = new Set<number>();
  for (const segment of segments) {
    if (subsystemIds.has(segment.peerNodeASystemId))
      ids.add(segment.nodeAPortSystemId);
    if (subsystemIds.has(segment.peerNodeBSystemId))
      ids.add(segment.nodeBPortSystemId);
  }
  return ids;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function rebuildMoveSubsystemImpact(
  fileSystemId: number,
  topology: SubsystemNodeTopology[],
  updatedModules: MoveComponent[],
  updatedSubsystems: MoveComponent[],
  dependencies: MoveImpactDependencies,
): Promise<MoveSubsystemImpact> {
  const parentBefore = new Map(
    topology.map(node => [node.systemId, node.parentId]),
  );
  const parentAfter = new Map(parentBefore);
  for (const component of [...updatedModules, ...updatedSubsystems]) {
    parentAfter.set(component.systemId, component.parentSystemId);
  }

  const subsystemIds = new Set(
    topology
      .filter(node => node.type === NodeType.Subsystem)
      .map(node => node.systemId),
  );
  const subsystemStates = new Map<
    number,
    NonNullable<
      Awaited<ReturnType<SubsystemRepository['findSubsystemForPatch']>>
    >
  >();
  await Promise.all(
    [...subsystemIds].map(async systemId => {
      const subsystem =
        await dependencies.subsystemRepository.findSubsystemForPatch(
          systemId,
          fileSystemId,
        );
      if (subsystem) subsystemStates.set(systemId, subsystem);
    }),
  );

  const changes = new Map<number, SubsystemPortChange>();
  const dataRoutes: DataRouteChange[] = [];
  const controlRoutes: ControlRouteChange[] = [];
  const dataLinks =
    await dependencies.dataLinkRepository.findAllWithSegments(fileSystemId);
  const controlLinks =
    await dependencies.controlLinkRepository.findAllWithSegments(fileSystemId);

  for (const link of dataLinks) {
    const oldRoute = getRoute(
      link.sourceNodeSystemId,
      link.destinationNodeSystemId,
      parentBefore,
    );
    const newRoute = getRoute(
      link.sourceNodeSystemId,
      link.destinationNodeSystemId,
      parentAfter,
    );
    if (routeSignature(oldRoute) === routeSignature(newRoute)) continue;
    const newSegments: SubsystemDataLink[] = [];
    const portsByNode = new Map<number, DataPort>();
    for (const nodeSystemId of newRoute.nodeSequence.slice(1, -1)) {
      const subsystem = subsystemStates.get(nodeSystemId);
      if (!subsystem) continue;
      const port = new DataPort({
        systemId: await dependencies.idGeneration.getNextId(fileSystemId),
        naturalId: nextPortId(subsystem.dataPorts),
        portIoType:
          newRoute.requiredPortType.get(nodeSystemId) ??
          PORT_IO_TYPE.OutputInput,
        isStatic: false,
        name: '',
      });
      subsystem.dataPorts.push(port);
      portsByNode.set(nodeSystemId, port);
      getOrCreatePortChange(changes, nodeSystemId).addedDataPorts.push(port);
      await dependencies.subsystemRepository.addDataPort(port, nodeSystemId);
    }
    for (let index = 0; index < newRoute.nodeSequence.length - 1; index++) {
      const sourceNodeSystemId = newRoute.nodeSequence[index];
      const destinationNodeSystemId = newRoute.nodeSequence[index + 1];
      newSegments.push(
        new SubsystemDataLink({
          systemId: await dependencies.idGeneration.getNextId(fileSystemId),
          sourceNodeSystemId,
          destinationNodeSystemId,
          sourcePortSystemId:
            index === 0
              ? link.sourcePortSystemId
              : portsByNode.get(sourceNodeSystemId)!.systemId,
          destinationPortSystemId:
            index === newRoute.nodeSequence.length - 2
              ? link.destinationPortSystemId
              : portsByNode.get(destinationNodeSystemId)!.systemId,
          dataLinkSystemId: link.systemId,
          fileSystemId,
        }),
      );
    }
    await dependencies.dataLinkRepository.replaceSubsystemDataLinkSegments(
      link.systemId,
      newSegments,
    );
    dataRoutes.push({
      link,
      oldSegments: link.subsystemDataLinks,
      newSegments,
    });
  }

  for (const link of controlLinks) {
    const oldRoute = getRoute(
      link.peerNodeASystemId,
      link.peerNodeBSystemId,
      parentBefore,
    );
    const newRoute = getRoute(
      link.peerNodeASystemId,
      link.peerNodeBSystemId,
      parentAfter,
    );
    if (routeSignature(oldRoute) === routeSignature(newRoute)) continue;
    const newSegments: SubsystemControlLink[] = [];
    const portsByNode = new Map<number, ControlPort>();
    for (const nodeSystemId of newRoute.nodeSequence.slice(1, -1)) {
      const subsystem = subsystemStates.get(nodeSystemId);
      if (!subsystem) continue;
      const port = new ControlPort({
        systemId: await dependencies.idGeneration.getNextId(fileSystemId),
        naturalId: nextPortId(subsystem.controlPorts),
        isStatic: false,
        nodeSystemId,
        name: '',
        intentSystemIds: [],
      });
      subsystem.controlPorts.push(port);
      portsByNode.set(nodeSystemId, port);
      getOrCreatePortChange(changes, nodeSystemId).addedControlPorts.push(port);
      await dependencies.subsystemRepository.addControlPort(port, nodeSystemId);
    }
    for (let index = 0; index < newRoute.nodeSequence.length - 1; index++) {
      const peerNodeASystemId = newRoute.nodeSequence[index];
      const peerNodeBSystemId = newRoute.nodeSequence[index + 1];
      const nodeAPortSystemId =
        index === 0
          ? link.nodeAPortSystemId
          : portsByNode.get(peerNodeASystemId)!.systemId;
      const nodeBPortSystemId =
        index === newRoute.nodeSequence.length - 2
          ? link.nodeBPortSystemId
          : portsByNode.get(peerNodeBSystemId)!.systemId;
      newSegments.push(
        new SubsystemControlLink(
          await dependencies.idGeneration.getNextId(fileSystemId),
          peerNodeASystemId,
          peerNodeBSystemId,
          nodeAPortSystemId,
          nodeBPortSystemId,
          link.systemId,
          fileSystemId,
          0,
        ),
      );
    }
    await dependencies.controlLinkRepository.replaceSubsystemControlLinkSegments(
      link.systemId,
      newSegments,
    );
    controlRoutes.push({
      link,
      oldSegments: link.subsystemControlLinks,
      newSegments,
    });
  }

  const usedDataPorts = new Set<number>();
  for (const route of dataRoutes) {
    for (const id of collectDataPortIds(route.newSegments, subsystemIds))
      usedDataPorts.add(id);
  }
  for (const link of dataLinks) {
    if (dataRoutes.some(route => route.link.systemId === link.systemId))
      continue;
    for (const id of collectDataPortIds(link.subsystemDataLinks, subsystemIds))
      usedDataPorts.add(id);
  }
  const usedControlPorts = new Set<number>();
  for (const route of controlRoutes) {
    for (const id of collectControlPortIds(route.newSegments, subsystemIds))
      usedControlPorts.add(id);
  }
  for (const link of controlLinks) {
    if (controlRoutes.some(route => route.link.systemId === link.systemId))
      continue;
    for (const id of collectControlPortIds(
      link.subsystemControlLinks,
      subsystemIds,
    ))
      usedControlPorts.add(id);
  }

  for (const route of dataRoutes) {
    for (const portId of collectDataPortIds(route.oldSegments, subsystemIds)) {
      if (usedDataPorts.has(portId)) continue;
      const owner = [...subsystemStates.values()].find(subsystem =>
        subsystem.dataPorts.some(port => port.systemId === portId),
      );
      const port = owner?.dataPorts.find(item => item.systemId === portId);
      if (!owner || !port || port.isStatic) continue;
      await dependencies.subsystemRepository.removeDataPort(
        portId,
        owner.systemId,
      );
      getOrCreatePortChange(changes, owner.systemId).removedDataPorts.push(
        portId,
      );
    }
  }
  for (const route of controlRoutes) {
    for (const portId of collectControlPortIds(
      route.oldSegments,
      subsystemIds,
    )) {
      if (usedControlPorts.has(portId)) continue;
      const owner = [...subsystemStates.values()].find(subsystem =>
        subsystem.controlPorts.some(port => port.systemId === portId),
      );
      const port = owner?.controlPorts.find(item => item.systemId === portId);
      if (!owner || !port || port.isStatic) continue;
      await dependencies.subsystemRepository.removeControlPort(
        portId,
        owner.systemId,
      );
      getOrCreatePortChange(changes, owner.systemId).removedControlPorts.push(
        portId,
      );
    }
  }

  return {
    addedDataLinks: dataRoutes.map(route => route.link),
    removedDataLinks: [],
    addedControlLinks: controlRoutes.map(route => route.link),
    removedControlLinks: [],
    subsystemPortChanges: [...changes.values()].filter(
      change =>
        change.addedDataPorts.length > 0 ||
        change.removedDataPorts.length > 0 ||
        change.addedControlPorts.length > 0 ||
        change.removedControlPorts.length > 0,
    ),
  };
}
