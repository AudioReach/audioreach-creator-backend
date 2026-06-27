/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NodeType} from '../../entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ResolutionInput {
  /** All SLS where dataLinkSystemId = null (committed + overlay merged by caller). */
  unresolvedSubsystemLinks: {
    systemId: number;
    sourceNodeSystemId: number;
    destinationNodeSystemId: number;
    sourcePortSystemId: number;
    destinationPortSystemId: number;
  }[];

  /** NodeType for every node that appears in the links. */
  nodeTypeMap: Map<number, NodeType>;
}

export interface ResolutionResult {
  completeChains: {
    /** Ordered SLS system_ids — used for SLS UPDATE edit actions. */
    ssLinkSystemIds: number[];
    /** The module where the chain starts. */
    sourceModuleSystemId: number;
    /** The module where the chain ends. */
    destModuleSystemId: number;
    /** First link's sourcePortSystemId → DataLink.sourcePortSystemId */
    sourcePortId: number;
    /** Last link's destPortSystemId → DataLink.destPortSystemId */
    destPortId: number;
  }[];

  incompleteChains: {
    /** All SLS system_ids in the incomplete chain (ordered). */
    ssLinkSystemIds: number[];
    /** Module where the chain begins. */
    startModuleSystemId: number;
    /** Last node reached before the dead end or cycle (may be a subsystem or module). */
    lastReachableNodeId: number;
  }[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface LinkEdge {
  ssLinkId: number;
  destNodeId: number;
  srcPortId: number;
  dstPortId: number;
}

interface TraversedLink {
  ssLinkId: number;
  srcPortId: number;
  dstPortId: number;
}

type PathResult =
  | {
      kind: 'complete';
      ssLinkSystemIds: number[];
      sourceModuleSystemId: number;
      destModuleSystemId: number;
      sourcePortId: number;
      destPortId: number;
    }
  | {
      kind: 'incomplete';
      ssLinkSystemIds: number[];
      startModuleSystemId: number;
      lastReachableNodeId: number;
    };

// ---------------------------------------------------------------------------
// Internal traversal helper (not exported — private to this module)
// ---------------------------------------------------------------------------

function traverse(
  currentNode: number,
  adjacency: Map<number, LinkEdge[]>,
  nodeTypeMap: Map<number, NodeType>,
  accumulated: TraversedLink[],
  visited: Set<number>,
  firstSrcPortId: number | null,
  startModuleSystemId: number,
): PathResult[] {
  const outgoing = adjacency.get(currentNode);

  if (!outgoing || outgoing.length === 0) {
    return [
      {
        kind: 'incomplete',
        ssLinkSystemIds: accumulated.map(l => l.ssLinkId),
        startModuleSystemId,
        lastReachableNodeId: currentNode,
      },
    ];
  }

  const results: PathResult[] = [];

  for (const edge of outgoing) {
    const {ssLinkId, destNodeId, srcPortId, dstPortId} = edge;
    const resolvedFirstSrcPort = firstSrcPortId ?? srcPortId;
    const newAccumulated = [...accumulated, {ssLinkId, srcPortId, dstPortId}];

    if (visited.has(destNodeId)) {
      results.push({
        kind: 'incomplete',
        ssLinkSystemIds: newAccumulated.map(l => l.ssLinkId),
        startModuleSystemId,
        lastReachableNodeId: destNodeId,
      });
      continue;
    }

    if (
      nodeTypeMap.get(destNodeId) === NodeType.Module &&
      destNodeId !== startModuleSystemId
    ) {
      results.push({
        kind: 'complete',
        ssLinkSystemIds: newAccumulated.map(l => l.ssLinkId),
        sourceModuleSystemId: startModuleSystemId,
        destModuleSystemId: destNodeId,
        sourcePortId: resolvedFirstSrcPort,
        destPortId: dstPortId,
      });
      continue;
    }

    results.push(
      ...traverse(
        destNodeId,
        adjacency,
        nodeTypeMap,
        newAccumulated,
        new Set([...visited, currentNode]),
        resolvedFirstSrcPort,
        startModuleSystemId,
      ),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ChainResolutionService = {
  /**
   * Given all unresolved SLS for a file, finds every complete chain
   * (module → subsystems → module) and returns the information needed to
   * create a DataLink for each. Also reports incomplete chains (dead ends
   * and cycles).
   *
   * Algorithm (spec section 5.2):
   * 1. Build directed adjacency map and collect module start nodes in one pass.
   * 2. For each start node, traverse forward (greedy). Fan-out spawns independent
   *    branches. Cycle detection via visited set.
   * 3. Terminate complete when destination is NodeType.Module (and not the start).
   *    Terminate incomplete on dead end or cycle.
   * 4. Carry first/last port IDs through the traversal to populate DataLink fields.
   */
  resolve(input: ResolutionInput): ResolutionResult {
    const {unresolvedSubsystemLinks, nodeTypeMap} = input;

    if (unresolvedSubsystemLinks.length === 0) {
      return {completeChains: [], incompleteChains: []};
    }

    const adjacency = new Map<number, LinkEdge[]>();
    const startNodes = new Set<number>();

    for (const link of unresolvedSubsystemLinks) {
      const edge: LinkEdge = {
        ssLinkId: link.systemId,
        destNodeId: link.destinationNodeSystemId,
        srcPortId: link.sourcePortSystemId,
        dstPortId: link.destinationPortSystemId,
      };

      const existing = adjacency.get(link.sourceNodeSystemId);
      if (existing) {
        existing.push(edge);
      } else {
        adjacency.set(link.sourceNodeSystemId, [edge]);
      }

      if (nodeTypeMap.get(link.sourceNodeSystemId) === NodeType.Module) {
        startNodes.add(link.sourceNodeSystemId);
      }
    }

    const completeChains: ResolutionResult['completeChains'] = [];
    const incompleteChains: ResolutionResult['incompleteChains'] = [];

    for (const startNode of startNodes) {
      for (const path of traverse(
        startNode,
        adjacency,
        nodeTypeMap,
        [],
        new Set(),
        null,
        startNode,
      )) {
        if (path.kind === 'complete') {
          completeChains.push(path);
        } else {
          incompleteChains.push(path);
        }
      }
    }

    return {completeChains, incompleteChains};
  },
} as const;
