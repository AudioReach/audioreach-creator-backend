/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NodeType} from '../../entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SubsystemDatalinkResolutionInput {
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

export interface SubsystemDatalinkResolutionResult {
  completeChains: {
    /** Ordered SLS system_ids — used for SLS UPDATE edit actions. */
    ssLinkSystemIds: number[];
    /** The module where the chain starts. */
    sourceModuleSystemId: number;
    /** The module where the chain ends. */
    destModuleSystemId: number;
    /** First link's sourcePortSystemId → DataLink.sourcePortSystemId */
    sourcePortSystemId: number;
    /** Last link's destPortSystemId → DataLink.destPortSystemId */
    destPortSystemId: number;
  }[];

  incompleteChains: {
    /** All SLS system_ids in the incomplete chain (ordered). */
    ssLinkSystemIds: number[];
    /** Module where the chain begins. */
    startModuleSystemId: number;
    /** Last node reached before the dead end or cycle (may be a subsystem or module). */
    lastReachableNodeSystemId: number;
  }[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface LinkEdge {
  ssLinkSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
}

interface TraversedLink {
  ssLinkSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
}

interface TraverseCtx {
  adjacency: Map<number, LinkEdge[]>;
  nodeTypeMap: Map<number, NodeType>;
  completeChains: SubsystemDatalinkResolutionResult['completeChains'];
  incompleteChains: SubsystemDatalinkResolutionResult['incompleteChains'];
}

// ---------------------------------------------------------------------------
// Internal traversal helper (not exported — private to this module)
// ---------------------------------------------------------------------------

function traverse(
  currentNode: number,
  accumulated: TraversedLink[],
  visited: Set<number>,
  firstSrcPortId: number | null,
  startModuleSystemId: number,
  ctx: TraverseCtx,
): void {
  const outgoing = ctx.adjacency.get(currentNode);

  if (!outgoing || outgoing.length === 0) {
    ctx.incompleteChains.push({
      ssLinkSystemIds: accumulated.map(l => l.ssLinkSystemId),
      startModuleSystemId,
      lastReachableNodeSystemId: currentNode,
    });
    return;
  }

  for (const edge of outgoing) {
    const {
      ssLinkSystemId,
      destinationNodeSystemId,
      sourcePortSystemId,
      destinationPortSystemId,
    } = edge;
    const resolvedFirstSrcPort = firstSrcPortId ?? sourcePortSystemId;
    const newAccumulated = [
      ...accumulated,
      {ssLinkSystemId, sourcePortSystemId, destinationPortSystemId},
    ];

    if (visited.has(destinationNodeSystemId)) {
      ctx.incompleteChains.push({
        ssLinkSystemIds: newAccumulated.map(l => l.ssLinkSystemId),
        startModuleSystemId,
        lastReachableNodeSystemId: destinationNodeSystemId,
      });
      continue;
    }

    if (
      ctx.nodeTypeMap.get(destinationNodeSystemId) === NodeType.Module &&
      destinationNodeSystemId !== startModuleSystemId
    ) {
      ctx.completeChains.push({
        ssLinkSystemIds: newAccumulated.map(l => l.ssLinkSystemId),
        sourceModuleSystemId: startModuleSystemId,
        destModuleSystemId: destinationNodeSystemId,
        sourcePortSystemId: resolvedFirstSrcPort,
        destPortSystemId: destinationPortSystemId,
      });
      continue;
    }

    traverse(
      destinationNodeSystemId,
      newAccumulated,
      new Set([...visited, currentNode]),
      resolvedFirstSrcPort,
      startModuleSystemId,
      ctx,
    );
  }
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
  resolve(
    input: SubsystemDatalinkResolutionInput,
  ): SubsystemDatalinkResolutionResult {
    const {unresolvedSubsystemLinks, nodeTypeMap} = input;

    if (unresolvedSubsystemLinks.length === 0) {
      return {completeChains: [], incompleteChains: []};
    }

    const adjacency = new Map<number, LinkEdge[]>();
    const startNodes = new Set<number>();

    for (const link of unresolvedSubsystemLinks) {
      const edge: LinkEdge = {
        ssLinkSystemId: link.systemId,
        destinationNodeSystemId: link.destinationNodeSystemId,
        sourcePortSystemId: link.sourcePortSystemId,
        destinationPortSystemId: link.destinationPortSystemId,
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

    const ctx: TraverseCtx = {
      adjacency,
      nodeTypeMap,
      completeChains: [],
      incompleteChains: [],
    };

    for (const startNode of startNodes) {
      traverse(startNode, [], new Set(), null, startNode, ctx);
    }

    return {
      completeChains: ctx.completeChains,
      incompleteChains: ctx.incompleteChains,
    };
  },
} as const;
