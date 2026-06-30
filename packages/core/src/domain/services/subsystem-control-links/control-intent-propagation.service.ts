/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NodeType} from '../../entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Public interfaces (spec §11.8)
// ---------------------------------------------------------------------------

export interface ClearInput {
  /** SubsystemControlLinks still present after the deletion. */
  remainingSubsystemControlLinks: {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  nodeTypeMap: Map<number, NodeType>;
  /** The link that was just deleted — used to seed the component search. */
  deletedSubsystemControlLink: {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
  };
}

export interface ClearResult {
  /** systemIds of every subsystem-node port now in an unanchored component. */
  portsToClear: number[];
}

export interface PropagateInput {
  /** Port that just received intents — BFS origin. */
  startPortSystemId: number;
  intentIds: number[];
  /** Full set of SubsystemControlLinks for the file (committed + overlay). */
  allSubsystemControlLinks: {
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  nodeTypeMap: Map<number, NodeType>;
  /** Current intents on every port (empty array = no intents yet). */
  portIntentMap: Map<number, number[]>;
}

export interface PropagateResult {
  portsToFill: {portSystemId: number; intentIds: number[]}[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ControlIntentPropagationService = {
  /**
   * Operation A — given the SubsystemControlLinks still present after a
   * deletion, find every subsystem-node port that now sits in a connected
   * component containing no module node. Those ports must have their intents
   * cleared (they are no longer anchored to a module).
   *
   * Algorithm (spec §11.8 Op A):
   *   1. Build an undirected node adjacency and a node→ports map from
   *      `remainingSubsystemControlLinks` in a single pass.
   *   2. BFS from each peer node of the deleted link to discover its connected
   *      component; track whether any module is reached during the BFS.
   *   3. If the component contains no module, collect every subsystem-node
   *      port from the node→ports map into `portsToClear`.
   *   4. `seenNodes` prevents re-exploring a component when both deleted-link
   *      endpoints happen to be in the same component.
   */
  findPortsToClear(input: ClearInput): ClearResult {
    const {
      remainingSubsystemControlLinks,
      nodeTypeMap,
      deletedSubsystemControlLink,
    } = input;
    const {adjacency, nodePortMap} = buildNodeGraph(
      remainingSubsystemControlLinks,
    );

    const portsToClear = new Set<number>();
    const seenNodes = new Set<number>();

    for (const startNode of [
      deletedSubsystemControlLink.peerNodeASystemId,
      deletedSubsystemControlLink.peerNodeBSystemId,
    ]) {
      if (seenNodes.has(startNode) || !adjacency.has(startNode)) continue;

      const {componentNodes, hasModule} = bfsComponent(
        startNode,
        adjacency,
        nodeTypeMap,
      );
      for (const nodeId of componentNodes) seenNodes.add(nodeId);

      if (!hasModule) {
        for (const port of collectUnanchoredPorts(
          componentNodes,
          nodePortMap,
          nodeTypeMap,
        )) {
          portsToClear.add(port);
        }
      }
    }

    return {portsToClear: [...portsToClear]};
  },

  /**
   * Operation B — given a port that has just received intents, BFS flood-fill
   * the SubsystemControlLink graph and return every empty subsystem-node port
   * reachable from it. The caller uses this to batch-write intent records.
   *
   * The graph is modelled at the **port level** with two edge kinds:
   *   - Segment edges: portA ↔ portB across a SubsystemControlLink.
   *   - Through-node edges: sibling ports on the same subsystem node (intent
   *     flows through the node from one boundary port to another).
   *
   * Three stopping rules (spec §11.8 Op B):
   *   1. Stop at module-owned ports — intent does not cross module boundaries.
   *   2. Stop at subsystem ports that already carry intents.
   *   3. Otherwise fill the port and continue traversal through it.
   *
   * Algorithm (spec §11.8 Op B):
   *   1. Build portToNode, nodeToPorts, and portPeers indexes in one pass.
   *   2. BFS from `startPortSystemId` (marked visited but not added to output —
   *      the caller has already populated it).
   *   3. For each dequeued port: expand segment edges, then expand through-node
   *      siblings on the same subsystem node.
   */
  cascadePropagate(input: PropagateInput): PropagateResult {
    const {
      startPortSystemId,
      intentIds,
      allSubsystemControlLinks,
      nodeTypeMap,
      portIntentMap,
    } = input;
    const {portToNode, nodeToPorts, portPeers} = buildPortGraph(
      allSubsystemControlLinks,
    );

    const portsToFill: PropagateResult['portsToFill'] = [];
    const visited = new Set<number>([startPortSystemId]);
    const queue: number[] = [startPortSystemId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      expandSegmentEdges(
        current,
        portPeers,
        nodeTypeMap,
        portIntentMap,
        intentIds,
        visited,
        portsToFill,
        queue,
      );
      expandThroughNodeEdges(
        current,
        portToNode,
        nodeToPorts,
        nodeTypeMap,
        portIntentMap,
        intentIds,
        visited,
        portsToFill,
        queue,
      );
    }

    return {portsToFill};
  },
} as const;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type SclLink = {
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
};

type PortEntry = {peerPort: number; peerNode: number};

// ---------------------------------------------------------------------------
// Private helpers — Op A
// ---------------------------------------------------------------------------

function addToMap(
  map: Map<number, number[]>,
  key: number,
  value: number,
): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildNodeGraph(links: readonly SclLink[]): {
  adjacency: Map<number, number[]>;
  nodePortMap: Map<number, number[]>;
} {
  const adjacency = new Map<number, number[]>();
  const nodePortMap = new Map<number, number[]>();
  for (const link of links) {
    addToMap(adjacency, link.peerNodeASystemId, link.peerNodeBSystemId);
    addToMap(adjacency, link.peerNodeBSystemId, link.peerNodeASystemId);
    addToMap(nodePortMap, link.peerNodeASystemId, link.nodeAPortSystemId);
    addToMap(nodePortMap, link.peerNodeBSystemId, link.nodeBPortSystemId);
  }
  return {adjacency, nodePortMap};
}

function bfsComponent(
  startNode: number,
  adjacency: Map<number, number[]>,
  nodeTypeMap: Map<number, NodeType>,
): {componentNodes: number[]; hasModule: boolean} {
  const componentNodes: number[] = [];
  const visited = new Set<number>([startNode]);
  const queue: number[] = [startNode];
  let hasModule = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    componentNodes.push(current);
    if (nodeTypeMap.get(current) === NodeType.Module) hasModule = true;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return {componentNodes, hasModule};
}

function collectUnanchoredPorts(
  componentNodes: number[],
  nodePortMap: Map<number, number[]>,
  nodeTypeMap: Map<number, NodeType>,
): number[] {
  const ports: number[] = [];
  for (const nodeId of componentNodes) {
    if (nodeTypeMap.get(nodeId) !== NodeType.Subsystem) continue;
    for (const portId of nodePortMap.get(nodeId) ?? []) ports.push(portId);
  }
  return ports;
}

// ---------------------------------------------------------------------------
// Private helpers — Op B
// ---------------------------------------------------------------------------

function registerPort(
  portToNode: Map<number, number>,
  nodeToPorts: Map<number, Set<number>>,
  nodeId: number,
  portId: number,
): void {
  portToNode.set(portId, nodeId);
  let ports = nodeToPorts.get(nodeId);
  if (!ports) {
    ports = new Set();
    nodeToPorts.set(nodeId, ports);
  }
  ports.add(portId);
}

function addPortPeer(
  portPeers: Map<number, PortEntry[]>,
  fromPort: number,
  peerPort: number,
  peerNode: number,
): void {
  let peers = portPeers.get(fromPort);
  if (!peers) {
    peers = [];
    portPeers.set(fromPort, peers);
  }
  peers.push({peerPort, peerNode});
}

function buildPortGraph(links: readonly SclLink[]): {
  portToNode: Map<number, number>;
  nodeToPorts: Map<number, Set<number>>;
  portPeers: Map<number, PortEntry[]>;
} {
  const portToNode = new Map<number, number>();
  const nodeToPorts = new Map<number, Set<number>>();
  const portPeers = new Map<number, PortEntry[]>();
  for (const link of links) {
    registerPort(
      portToNode,
      nodeToPorts,
      link.peerNodeASystemId,
      link.nodeAPortSystemId,
    );
    registerPort(
      portToNode,
      nodeToPorts,
      link.peerNodeBSystemId,
      link.nodeBPortSystemId,
    );
    addPortPeer(
      portPeers,
      link.nodeAPortSystemId,
      link.nodeBPortSystemId,
      link.peerNodeBSystemId,
    );
    addPortPeer(
      portPeers,
      link.nodeBPortSystemId,
      link.nodeAPortSystemId,
      link.peerNodeASystemId,
    );
  }
  return {portToNode, nodeToPorts, portPeers};
}

function expandSegmentEdges(
  current: number,
  portPeers: Map<number, PortEntry[]>,
  nodeTypeMap: Map<number, NodeType>,
  portIntentMap: Map<number, number[]>,
  intentIds: number[],
  visited: Set<number>,
  portsToFill: PropagateResult['portsToFill'],
  queue: number[],
): void {
  for (const {peerPort, peerNode} of portPeers.get(current) ?? []) {
    if (visited.has(peerPort)) continue;
    visited.add(peerPort);
    if (nodeTypeMap.get(peerNode) === NodeType.Module) continue;
    if ((portIntentMap.get(peerPort) ?? []).length > 0) continue;
    portsToFill.push({portSystemId: peerPort, intentIds});
    queue.push(peerPort);
  }
}

function expandThroughNodeEdges(
  current: number,
  portToNode: Map<number, number>,
  nodeToPorts: Map<number, Set<number>>,
  nodeTypeMap: Map<number, NodeType>,
  portIntentMap: Map<number, number[]>,
  intentIds: number[],
  visited: Set<number>,
  portsToFill: PropagateResult['portsToFill'],
  queue: number[],
): void {
  const currentNode = portToNode.get(current);
  if (
    currentNode === undefined ||
    nodeTypeMap.get(currentNode) !== NodeType.Subsystem
  )
    return;
  for (const siblingPort of nodeToPorts.get(currentNode) ?? []) {
    if (siblingPort === current || visited.has(siblingPort)) continue;
    visited.add(siblingPort);
    if ((portIntentMap.get(siblingPort) ?? []).length > 0) continue;
    portsToFill.push({portSystemId: siblingPort, intentIds});
    queue.push(siblingPort);
  }
}
