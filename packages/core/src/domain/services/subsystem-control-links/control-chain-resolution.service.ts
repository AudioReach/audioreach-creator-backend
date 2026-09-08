/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NodeType} from '../../entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Public interfaces (spec §11.9)
// ---------------------------------------------------------------------------

export interface SubsystemControlLinkResolutionInput {
  /** All unresolved SubsystemControlLinks for a file. */
  unresolvedSubsystemlinks: {
    systemId: number;
    peerNodeASystemId: number;
    peerNodeBSystemId: number;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
  }[];
  /** NodeType for every node that appears in the links. */
  nodeTypeMap: Map<number, NodeType>;
}

export interface SubsystemControlLinkResolutionResult {
  completeChains: {
    /** Ordered SubsystemControlLink system_ids as traversed. */
    ssLinksSystemIds: number[];
    /** Endpoint with the lower port id (canonical peerA). */
    peerAPortSystemId: number;
    /** Endpoint with the higher port id (canonical peerB). */
    peerBPortSystemId: number;
    peerAModuleSystemId: number;
    peerBModuleSystemId: number;
  }[];
  incompleteChains: {
    ssLinksSystemIds: number[];
    /** Every node touched on this branch, including the start and dead-end. */
    reachableNodeIds: number[];
  }[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ControlChainResolutionService = {
  /**
   * Given all unresolved SubsystemControlLinks for a file, finds every
   * complete undirected path between two module nodes (a module-to-module
   * control chain) and returns the canonical information needed to create a
   * ControlLink for each. Also reports incomplete chains (dead ends / cycles).
   *
   * Algorithm (spec §11.9):
   *   1. Build undirected adjacency: each SubsystemControlLink contributes two
   *      entries — one per direction — so traversal is direction-agnostic.
   *   2. Collect every module node that appears in any link.
   *   3. DFS from each module: skip the incoming link to avoid immediate
   *      back-tracking; detect cycles via a per-branch visited set.
   *   4. Complete when the current node is a different module. Incomplete on
   *      dead end or cycle.
   *   5. De-duplicate by sorted link-id key: forward and reverse traversals
   *      from both terminus modules collapse to one output row.
   *   6. Canonicalise: peerA = lower portSystemId endpoint.
   */
  resolve(
    input: SubsystemControlLinkResolutionInput,
  ): SubsystemControlLinkResolutionResult {
    const {
      unresolvedSubsystemlinks: unresolvedSubsystemControlLinks,
      nodeTypeMap,
    } = input;

    if (unresolvedSubsystemControlLinks.length === 0) {
      return {completeChains: [], incompleteChains: []};
    }

    const adjacency = new Map<number, AdjEdge[]>();
    const addEdge = (from: number, edge: AdjEdge): void => {
      const list = adjacency.get(from);
      if (list) list.push(edge);
      else adjacency.set(from, [edge]);
    };

    for (const link of unresolvedSubsystemControlLinks) {
      addEdge(link.peerNodeASystemId, {
        neighborSystemId: link.peerNodeBSystemId,
        subsystemControlLinkSystemId: link.systemId,
        portOnThis: link.nodeAPortSystemId,
        portOnNeighbor: link.nodeBPortSystemId,
      });
      addEdge(link.peerNodeBSystemId, {
        neighborSystemId: link.peerNodeASystemId,
        subsystemControlLinkSystemId: link.systemId,
        portOnThis: link.nodeBPortSystemId,
        portOnNeighbor: link.nodeAPortSystemId,
      });
    }

    const ctx: TraverseCtx = {
      adjacency,
      nodeTypeMap,
      completeChains: [],
      incompleteChains: [],
      seenComplete: new Set(),
      seenIncomplete: new Set(),
    };

    for (const nodeId of adjacency.keys()) {
      if (nodeTypeMap.get(nodeId) !== NodeType.Module) continue;

      for (const firstEdge of adjacency.get(nodeId)!) {
        traverse(
          nodeId,
          firstEdge.portOnThis,
          firstEdge.neighborSystemId,
          [
            {
              subsystemControlLinkSystemId:
                firstEdge.subsystemControlLinkSystemId,
              neighborPort: firstEdge.portOnNeighbor,
            },
          ],
          new Set([nodeId, firstEdge.neighborSystemId]),
          [nodeId, firstEdge.neighborSystemId],
          firstEdge.subsystemControlLinkSystemId,
          ctx,
        );
      }
    }

    return {
      completeChains: ctx.completeChains,
      incompleteChains: ctx.incompleteChains,
    };
  },
} as const;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AdjEdge {
  neighborSystemId: number;
  subsystemControlLinkSystemId: number;
  portOnThis: number; // port belonging to the node that owns this edge entry
  portOnNeighbor: number; // port belonging to the neighbor node
}

interface Step {
  subsystemControlLinkSystemId: number;
  neighborPort: number; // port on the node we just arrived at
}

interface TraverseCtx {
  adjacency: Map<number, AdjEdge[]>;
  nodeTypeMap: Map<number, NodeType>;
  completeChains: SubsystemControlLinkResolutionResult['completeChains'];
  incompleteChains: SubsystemControlLinkResolutionResult['incompleteChains'];
  seenComplete: Set<string>;
  seenIncomplete: Set<string>;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function linkIds(steps: Step[]): number[] {
  return steps.map(s => s.subsystemControlLinkSystemId);
}

function chainKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

function recordIncomplete(
  ids: number[],
  reachable: number[],
  ctx: TraverseCtx,
): void {
  const key = chainKey(ids);
  if (!ctx.seenIncomplete.has(key)) {
    ctx.seenIncomplete.add(key);
    ctx.incompleteChains.push({
      ssLinksSystemIds: ids,
      reachableNodeIds: [...reachable],
    });
  }
}

function recordComplete(
  ids: number[],
  startPort: number,
  endPort: number,
  startNode: number,
  endNode: number,
  ctx: TraverseCtx,
): void {
  const key = chainKey(ids);
  if (!ctx.seenComplete.has(key)) {
    ctx.seenComplete.add(key);
    const aIsStart = startPort < endPort;
    ctx.completeChains.push({
      ssLinksSystemIds: ids,
      peerAPortSystemId: aIsStart ? startPort : endPort,
      peerBPortSystemId: aIsStart ? endPort : startPort,
      peerAModuleSystemId: aIsStart ? startNode : endNode,
      peerBModuleSystemId: aIsStart ? endNode : startNode,
    });
  }
}

function traverse(
  startNode: number,
  startPort: number,
  currentNode: number,
  steps: Step[],
  visited: Set<number>,
  reachable: number[],
  incomingLinkId: number,
  ctx: TraverseCtx,
): void {
  if (
    ctx.nodeTypeMap.get(currentNode) === NodeType.Module &&
    currentNode !== startNode
  ) {
    recordComplete(
      linkIds(steps),
      startPort,
      steps.at(-1)!.neighborPort,
      startNode,
      currentNode,
      ctx,
    );
    return;
  }

  const candidates = (ctx.adjacency.get(currentNode) ?? []).filter(
    e => e.subsystemControlLinkSystemId !== incomingLinkId,
  );

  if (candidates.length === 0) {
    recordIncomplete(linkIds(steps), reachable, ctx);
    return;
  }

  for (const edge of candidates) {
    if (visited.has(edge.neighborSystemId)) {
      recordIncomplete(
        [...linkIds(steps), edge.subsystemControlLinkSystemId],
        reachable,
        ctx,
      );
      continue;
    }

    // Mutate-and-backtrack: O(1) per call vs O(n) Set/array copy per call.
    steps.push({
      subsystemControlLinkSystemId: edge.subsystemControlLinkSystemId,
      neighborPort: edge.portOnNeighbor,
    });
    visited.add(edge.neighborSystemId);
    reachable.push(edge.neighborSystemId);

    traverse(
      startNode,
      startPort,
      edge.neighborSystemId,
      steps,
      visited,
      reachable,
      edge.subsystemControlLinkSystemId,
      ctx,
    );

    steps.pop();
    visited.delete(edge.neighborSystemId);
    reachable.pop();
  }
}
