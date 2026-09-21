/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';
import {ChainResolutionService} from '../../../../domain/services/subsystem-data-links/datalink-chain-resolution.service.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
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

type SubsystemState = NonNullable<
  Awaited<ReturnType<SubsystemRepository['getSubsystem']>>
>;

type UnresolvedDataRebuild = {
  retainedSegments: SubsystemDataLink[];
  replacedSegments: SubsystemDataLink[];
};

type UnresolvedControlRebuild = {
  retainedSegments: SubsystemControlLink[];
  replacedSegments: SubsystemControlLink[];
};

type RouteState = {
  nodeSequence: number[];
  requiredPortType: Map<
    number,
    typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
  >;
};

type DataChain = {
  ids: number[];
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
};

type ControlChain = {
  ids: number[];
  sourceNodeSystemId: number;
  destinationNodeSystemId: number | undefined;
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

function collectMovedNodeIds(
  topology: readonly SubsystemNodeTopology[],
  parentBefore: ReadonlyMap<number, number | null>,
  updatedModules: readonly MoveComponent[],
  updatedSubsystems: readonly MoveComponent[],
): Set<number> {
  const movedSubsystemIds = new Set(
    updatedSubsystems.map(component => component.systemId),
  );
  const movedNodeIds = new Set([
    ...updatedModules.map(component => component.systemId),
    ...movedSubsystemIds,
  ]);

  for (const node of topology) {
    let parentSystemId = parentBefore.get(node.systemId) ?? null;
    const visited = new Set<number>();
    while (parentSystemId !== null && !visited.has(parentSystemId)) {
      if (movedSubsystemIds.has(parentSystemId)) {
        movedNodeIds.add(node.systemId);
        break;
      }
      visited.add(parentSystemId);
      parentSystemId = parentBefore.get(parentSystemId) ?? null;
    }
  }

  return movedNodeIds;
}

function dataPortByNode(
  segments: readonly SubsystemDataLink[],
): Map<number, number> {
  const result = new Map<number, number>();
  for (const segment of segments) {
    result.set(segment.sourceNodeSystemId, segment.sourcePortSystemId);
    result.set(
      segment.destinationNodeSystemId,
      segment.destinationPortSystemId,
    );
  }
  return result;
}

function controlPortByNode(
  segments: readonly SubsystemControlLink[],
): Map<number, number> {
  const result = new Map<number, number>();
  for (const segment of segments) {
    result.set(segment.peerNodeASystemId, segment.nodeAPortSystemId);
    result.set(segment.peerNodeBSystemId, segment.nodeBPortSystemId);
  }
  return result;
}

function endpointPort(segment: SubsystemControlLink, nodeId: number): number {
  return segment.peerNodeASystemId === nodeId
    ? segment.nodeAPortSystemId
    : segment.nodeBPortSystemId;
}

function dataChainTouchesMovedNode(
  chain: DataChain,
  byId: ReadonlyMap<number, SubsystemDataLink>,
  movedNodeIds: ReadonlySet<number>,
): boolean {
  return chain.ids.some(id => {
    const segment = byId.get(id);
    return (
      segment !== undefined &&
      (movedNodeIds.has(segment.sourceNodeSystemId) ||
        movedNodeIds.has(segment.destinationNodeSystemId))
    );
  });
}

async function prepareDataPorts(
  fileSystemId: number,
  route: RouteState,
  oldPorts: ReadonlyMap<number, number>,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<Map<number, DataPort>> {
  const ports = new Map<number, DataPort>();
  for (const nodeSystemId of route.nodeSequence.slice(1, -1)) {
    const subsystem = subsystemStates.get(nodeSystemId);
    if (!subsystem) continue;
    const existingPortId = oldPorts.get(nodeSystemId);
    const port =
      existingPortId === undefined
        ? new DataPort({
            systemId: await dependencies.idGeneration.getNextId(fileSystemId),
            naturalId: nextPortId(subsystem.dataPorts),
            portIoType:
              route.requiredPortType.get(nodeSystemId) ??
              PORT_IO_TYPE.OutputInput,
            isStatic: false,
            name: '',
          })
        : (subsystem.dataPorts.find(item => item.systemId === existingPortId) ??
          new DataPort({
            systemId: existingPortId,
            naturalId: nextPortId(subsystem.dataPorts),
            portIoType:
              route.requiredPortType.get(nodeSystemId) ??
              PORT_IO_TYPE.OutputInput,
            isStatic: false,
            name: '',
          }));
    if (existingPortId === undefined) {
      subsystem.dataPorts.push(port);
      getOrCreatePortChange(changes, nodeSystemId).addedDataPorts.push(port);
      await dependencies.subsystemRepository.addDataPort(port, nodeSystemId);
    }
    ports.set(nodeSystemId, port);
  }
  return ports;
}

async function createUnresolvedDataSegments(
  fileSystemId: number,
  route: RouteState,
  oldSegments: readonly SubsystemDataLink[],
  portsByNode: ReadonlyMap<number, DataPort>,
  dependencies: MoveImpactDependencies,
): Promise<SubsystemDataLink[]> {
  const segments: SubsystemDataLink[] = [];
  for (let index = 0; index < route.nodeSequence.length - 1; index++) {
    const sourceNodeSystemId = route.nodeSequence[index];
    const destinationNodeSystemId = route.nodeSequence[index + 1];
    segments.push(
      new SubsystemDataLink({
        systemId: await dependencies.idGeneration.getNextId(fileSystemId),
        sourceNodeSystemId,
        destinationNodeSystemId,
        sourcePortSystemId:
          index === 0
            ? oldSegments[0].sourcePortSystemId
            : portsByNode.get(sourceNodeSystemId)!.systemId,
        destinationPortSystemId:
          index === route.nodeSequence.length - 2
            ? oldSegments.at(-1)!.destinationPortSystemId
            : portsByNode.get(destinationNodeSystemId)!.systemId,
        dataLinkSystemId: null,
        fileSystemId,
        linkType: oldSegments[0].linkType,
      }),
    );
  }
  return segments;
}

async function rebuildDataChain(
  fileSystemId: number,
  chain: DataChain,
  byId: ReadonlyMap<number, SubsystemDataLink>,
  rebuilt: ReadonlySet<number>,
  movedNodeIds: ReadonlySet<number>,
  parentBefore: Map<number, number | null>,
  parentAfter: Map<number, number | null>,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<{
  oldSegments: SubsystemDataLink[];
  newSegments: SubsystemDataLink[];
} | null> {
  if (
    chain.ids.length === 0 ||
    chain.ids.some(id => rebuilt.has(id)) ||
    !dataChainTouchesMovedNode(chain, byId, movedNodeIds)
  )
    return null;
  const oldSegments = chain.ids
    .map(id => byId.get(id))
    .filter((segment): segment is SubsystemDataLink => segment !== undefined);
  if (oldSegments.length !== chain.ids.length) return null;
  const oldRoute = getRoute(
    chain.sourceNodeSystemId,
    chain.destinationNodeSystemId,
    parentBefore,
  );
  const newRoute = getRoute(
    chain.sourceNodeSystemId,
    chain.destinationNodeSystemId,
    parentAfter,
  );
  if (routeSignature(oldRoute) === routeSignature(newRoute)) return null;
  const portsByNode = await prepareDataPorts(
    fileSystemId,
    newRoute,
    dataPortByNode(oldSegments),
    subsystemStates,
    changes,
    dependencies,
  );
  const newSegments = await createUnresolvedDataSegments(
    fileSystemId,
    newRoute,
    oldSegments,
    portsByNode,
    dependencies,
  );
  await dependencies.dataLinkRepository.replaceUnresolvedSubsystemDataLinkSegments(
    chain.ids,
    newSegments,
    fileSystemId,
  );
  return {oldSegments, newSegments};
}

async function rebuildUnresolvedDataChains(
  fileSystemId: number,
  parentBefore: Map<number, number | null>,
  parentAfter: Map<number, number | null>,
  movedNodeIds: ReadonlySet<number>,
  routeContext: Awaited<
    ReturnType<DataLinkRepository['findDataLinkRouteContext']>
  >,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<UnresolvedDataRebuild> {
  const unresolved = routeContext.subsystemDataLinks.filter(
    segment => segment.dataLinkSystemId === null,
  );
  const byId = new Map(unresolved.map(segment => [segment.systemId, segment]));
  const resolution = ChainResolutionService.resolve({
    unresolvedSubsystemLinks: unresolved,
    nodeTypeMap: new Map(routeContext.nodeTypeBySystemId),
  });
  const chains: DataChain[] = [
    ...resolution.completeChains.map(chain => ({
      ids: chain.ssLinkSystemIds,
      sourceNodeSystemId: chain.sourceModuleSystemId,
      destinationNodeSystemId: chain.destModuleSystemId,
    })),
    ...resolution.incompleteChains.map(chain => ({
      ids: chain.ssLinkSystemIds,
      sourceNodeSystemId: chain.startModuleSystemId,
      destinationNodeSystemId: chain.lastReachableNodeSystemId,
    })),
  ];
  const rebuilt = new Set<number>();
  const retained: SubsystemDataLink[] = [];
  const replacedSegments: SubsystemDataLink[] = [];
  for (const chain of chains) {
    const result = await rebuildDataChain(
      fileSystemId,
      chain,
      byId,
      rebuilt,
      movedNodeIds,
      parentBefore,
      parentAfter,
      subsystemStates,
      changes,
      dependencies,
    );
    if (!result) continue;
    for (const id of chain.ids) rebuilt.add(id);
    replacedSegments.push(...result.oldSegments);
    retained.push(...result.newSegments);
  }
  retained.push(
    ...unresolved.filter(segment => !rebuilt.has(segment.systemId)),
  );
  return {retainedSegments: retained, replacedSegments};
}

function controlChainTouchesMovedNode(
  chain: ControlChain,
  byId: ReadonlyMap<number, SubsystemControlLink>,
  movedNodeIds: ReadonlySet<number>,
): boolean {
  return chain.ids.some(id => {
    const segment = byId.get(id);
    return (
      segment !== undefined &&
      (movedNodeIds.has(segment.peerNodeASystemId) ||
        movedNodeIds.has(segment.peerNodeBSystemId))
    );
  });
}

async function prepareControlPorts(
  fileSystemId: number,
  route: RouteState,
  oldPorts: ReadonlyMap<number, number>,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<Map<number, ControlPort>> {
  const ports = new Map<number, ControlPort>();
  for (const nodeSystemId of route.nodeSequence.slice(1, -1)) {
    const subsystem = subsystemStates.get(nodeSystemId);
    if (!subsystem) continue;
    const existingPortId = oldPorts.get(nodeSystemId);
    const port =
      existingPortId === undefined
        ? new ControlPort({
            systemId: await dependencies.idGeneration.getNextId(fileSystemId),
            naturalId: nextPortId(subsystem.controlPorts),
            isStatic: false,
            nodeSystemId,
            name: '',
            intentSystemIds: [],
          })
        : (subsystem.controlPorts.find(
            item => item.systemId === existingPortId,
          ) ??
          new ControlPort({
            systemId: existingPortId,
            naturalId: nextPortId(subsystem.controlPorts),
            isStatic: false,
            nodeSystemId,
            name: '',
            intentSystemIds: [],
          }));
    if (existingPortId === undefined) {
      subsystem.controlPorts.push(port);
      getOrCreatePortChange(changes, nodeSystemId).addedControlPorts.push(port);
      await dependencies.subsystemRepository.addControlPort(port, nodeSystemId);
    }
    ports.set(nodeSystemId, port);
  }
  return ports;
}

async function createUnresolvedControlSegments(
  fileSystemId: number,
  route: RouteState,
  oldSegments: readonly SubsystemControlLink[],
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
  portsByNode: ReadonlyMap<number, ControlPort>,
  dependencies: MoveImpactDependencies,
): Promise<SubsystemControlLink[]> {
  const firstOldSegment = oldSegments.find(segment =>
    [segment.peerNodeASystemId, segment.peerNodeBSystemId].includes(
      sourceNodeSystemId,
    ),
  )!;
  const lastOldSegment = oldSegments.find(segment =>
    [segment.peerNodeASystemId, segment.peerNodeBSystemId].includes(
      destinationNodeSystemId,
    ),
  )!;
  const segments: SubsystemControlLink[] = [];
  for (let index = 0; index < route.nodeSequence.length - 1; index++) {
    const peerNodeASystemId = route.nodeSequence[index];
    const peerNodeBSystemId = route.nodeSequence[index + 1];
    segments.push(
      new SubsystemControlLink(
        await dependencies.idGeneration.getNextId(fileSystemId),
        peerNodeASystemId,
        peerNodeBSystemId,
        index === 0
          ? endpointPort(firstOldSegment, sourceNodeSystemId)
          : portsByNode.get(peerNodeASystemId)!.systemId,
        index === route.nodeSequence.length - 2
          ? endpointPort(lastOldSegment, destinationNodeSystemId)
          : portsByNode.get(peerNodeBSystemId)!.systemId,
        null,
        fileSystemId,
        firstOldSegment.linkType,
        0,
      ),
    );
  }
  return segments;
}

async function rebuildControlChain(
  fileSystemId: number,
  chain: ControlChain,
  byId: ReadonlyMap<number, SubsystemControlLink>,
  rebuilt: ReadonlySet<number>,
  movedNodeIds: ReadonlySet<number>,
  parentBefore: Map<number, number | null>,
  parentAfter: Map<number, number | null>,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<{
  oldSegments: SubsystemControlLink[];
  newSegments: SubsystemControlLink[];
} | null> {
  const destinationNodeSystemId = chain.destinationNodeSystemId;
  if (
    destinationNodeSystemId === undefined ||
    chain.ids.length === 0 ||
    chain.ids.some(id => rebuilt.has(id)) ||
    !controlChainTouchesMovedNode(chain, byId, movedNodeIds)
  )
    return null;
  const oldSegments = chain.ids
    .map(id => byId.get(id))
    .filter(
      (segment): segment is SubsystemControlLink => segment !== undefined,
    );
  if (oldSegments.length !== chain.ids.length) return null;
  const oldRoute = getRoute(
    chain.sourceNodeSystemId,
    destinationNodeSystemId,
    parentBefore,
  );
  const newRoute = getRoute(
    chain.sourceNodeSystemId,
    destinationNodeSystemId,
    parentAfter,
  );
  if (routeSignature(oldRoute) === routeSignature(newRoute)) return null;
  const portsByNode = await prepareControlPorts(
    fileSystemId,
    newRoute,
    controlPortByNode(oldSegments),
    subsystemStates,
    changes,
    dependencies,
  );
  const newSegments = await createUnresolvedControlSegments(
    fileSystemId,
    newRoute,
    oldSegments,
    chain.sourceNodeSystemId,
    destinationNodeSystemId,
    portsByNode,
    dependencies,
  );
  await dependencies.controlLinkRepository.replaceUnresolvedSubsystemControlLinkSegments(
    chain.ids,
    newSegments,
    fileSystemId,
  );
  return {oldSegments, newSegments};
}

async function rebuildUnresolvedControlChains(
  fileSystemId: number,
  parentBefore: Map<number, number | null>,
  parentAfter: Map<number, number | null>,
  movedNodeIds: ReadonlySet<number>,
  routeContext: Awaited<
    ReturnType<ControlLinkRepository['findControlLinkRouteContext']>
  >,
  subsystemStates: Map<number, SubsystemState>,
  changes: Map<number, SubsystemPortChange>,
  dependencies: MoveImpactDependencies,
): Promise<UnresolvedControlRebuild> {
  const unresolved = routeContext.subsystemControlLinks.filter(
    segment => segment.controlLinkSystemId === null,
  );
  const byId = new Map(unresolved.map(segment => [segment.systemId, segment]));
  const resolution = ControlChainResolutionService.resolve({
    unresolvedSubsystemlinks: unresolved,
    nodeTypeMap: new Map(routeContext.nodeTypeBySystemId),
  });
  const chains: ControlChain[] = [
    ...resolution.completeChains.map(chain => ({
      ids: chain.ssLinksSystemIds,
      sourceNodeSystemId: chain.peerAModuleSystemId,
      destinationNodeSystemId: chain.peerBModuleSystemId,
    })),
    ...resolution.incompleteChains.map(chain => ({
      ids: chain.ssLinksSystemIds,
      sourceNodeSystemId: chain.reachableNodeIds[0],
      destinationNodeSystemId: chain.reachableNodeIds.at(-1),
    })),
  ];
  const rebuilt = new Set<number>();
  const retained: SubsystemControlLink[] = [];
  const replacedSegments: SubsystemControlLink[] = [];
  for (const chain of chains) {
    const result = await rebuildControlChain(
      fileSystemId,
      chain,
      byId,
      rebuilt,
      movedNodeIds,
      parentBefore,
      parentAfter,
      subsystemStates,
      changes,
      dependencies,
    );
    if (!result) continue;
    for (const id of chain.ids) rebuilt.add(id);
    replacedSegments.push(...result.oldSegments);
    retained.push(...result.newSegments);
  }
  retained.push(
    ...unresolved.filter(segment => !rebuilt.has(segment.systemId)),
  );
  return {retainedSegments: retained, replacedSegments};
}

function routeSignature(route: RouteState): string {
  return route.nodeSequence.join(':');
}

function getRoute(
  sourceNodeId: number,
  destinationNodeId: number,
  parentByNode: Map<number, number | null>,
): RouteState {
  const segments = SubsystemBoundaryPathService.compute({
    sourceNodeSystemId: sourceNodeId,
    destinationNodeSystemId: destinationNodeId,
    nodeParentMap: parentByNode,
  });
  const rawNodeSequence =
    segments.length === 0
      ? [sourceNodeId, destinationNodeId]
      : [
          segments[0].sourceNodeSystemId,
          ...segments.map(segment => segment.destinationNodeSystemId),
        ];
  const nodeSequence: number[] = [];
  for (const node of rawNodeSequence) {
    if (node !== nodeSequence.at(-1)) nodeSequence.push(node);
  }
  const requiredPortType = new Map<
    number,
    typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
  >();
  for (const segment of segments) {
    if (
      segment.sourceBoundaryPortType === PORT_IO_TYPE.OutputInput ||
      segment.sourceBoundaryPortType === PORT_IO_TYPE.InputOutput
    ) {
      requiredPortType.set(
        segment.sourceNodeSystemId,
        segment.sourceBoundaryPortType,
      );
    }
    if (
      segment.destBoundaryPortType === PORT_IO_TYPE.OutputInput ||
      segment.destBoundaryPortType === PORT_IO_TYPE.InputOutput
    ) {
      requiredPortType.set(
        segment.destinationNodeSystemId,
        segment.destBoundaryPortType,
      );
    }
  }
  return {nodeSequence, requiredPortType};
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
    topology.map(node => [node.systemId, node.parentSystemId]),
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
    NonNullable<Awaited<ReturnType<SubsystemRepository['getSubsystem']>>>
  >();
  await Promise.all(
    [...subsystemIds].map(async systemId => {
      const subsystem = await dependencies.subsystemRepository.getSubsystem(
        systemId,
        fileSystemId,
      );
      if (subsystem) subsystemStates.set(systemId, subsystem);
    }),
  );

  const changes = new Map<number, SubsystemPortChange>();
  const dataRoutes: DataRouteChange[] = [];
  const controlRoutes: ControlRouteChange[] = [];
  const [dataLinks, controlLinks, dataRouteContext, controlRouteContext] =
    await Promise.all([
      dependencies.dataLinkRepository.findAllDataLinksWithResolvedSegments(
        fileSystemId,
      ),
      dependencies.controlLinkRepository.findAllControlLinksWithResolvedSegments(
        fileSystemId,
      ),
      dependencies.dataLinkRepository.findDataLinkRouteContext(fileSystemId),
      dependencies.controlLinkRepository.findControlLinkRouteContext(
        fileSystemId,
      ),
    ]);
  const movedNodeIds = collectMovedNodeIds(
    topology,
    parentBefore,
    updatedModules,
    updatedSubsystems,
  );
  const unresolvedDataRebuild = await rebuildUnresolvedDataChains(
    fileSystemId,
    parentBefore,
    parentAfter,
    movedNodeIds,
    dataRouteContext,
    subsystemStates,
    changes,
    dependencies,
  );
  const unresolvedControlRebuild = await rebuildUnresolvedControlChains(
    fileSystemId,
    parentBefore,
    parentAfter,
    movedNodeIds,
    controlRouteContext,
    subsystemStates,
    changes,
    dependencies,
  );

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
          linkType: link.linkType,
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
          link.linkType,
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
  for (const id of collectDataPortIds(
    unresolvedDataRebuild.retainedSegments,
    subsystemIds,
  ))
    usedDataPorts.add(id);
  for (const id of collectControlPortIds(
    unresolvedControlRebuild.retainedSegments,
    subsystemIds,
  ))
    usedControlPorts.add(id);

  const oldDataSegmentGroups = [
    ...dataRoutes.map(route => route.oldSegments),
    unresolvedDataRebuild.replacedSegments,
  ];
  for (const segments of oldDataSegmentGroups) {
    for (const portId of collectDataPortIds(segments, subsystemIds)) {
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
  const oldControlSegmentGroups = [
    ...controlRoutes.map(route => route.oldSegments),
    unresolvedControlRebuild.replacedSegments,
  ];
  for (const segments of oldControlSegmentGroups) {
    for (const portId of collectControlPortIds(segments, subsystemIds)) {
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
