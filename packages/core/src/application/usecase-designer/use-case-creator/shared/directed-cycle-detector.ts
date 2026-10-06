/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ManualTopologyPair} from '../contracts/routing-input.js';

/** Diagnostic payload for one deterministic directed data-link cycle. */
export interface DirectedCycle {
  readonly subgraphSystemIds: readonly number[];
  readonly dataLinkSystemIds: readonly number[];
}

interface DirectedEdge {
  readonly source: number;
  readonly destination: number;
  readonly dataLinkSystemIds: readonly number[];
}

/**
 * Finds cycles only in data-supported topology. Control-only relationships
 * are deliberately ignored because they do not define directed data flow.
 */
export class DirectedCycleDetector {
  findCycle(pairs: readonly ManualTopologyPair[]): DirectedCycle | null {
    // Collapse each topology pair to one graph edge while retaining every
    // supporting link ID for the eventual diagnostic.
    const edges = pairs
      .filter(pair => pair.dataLinks.length > 0)
      .map(pair => ({
        source: pair.pair.sourceSubgraphSystemId,
        destination: pair.pair.destSubgraphSystemId,
        dataLinkSystemIds: [...pair.dataLinks]
          .map(link => link.systemId)
          .sort((left, right) => left - right),
      }))
      .sort(
        (left, right) =>
          left.source - right.source || left.destination - right.destination,
      );

    return findFirstCycle(edges);
  }
}

/** Runs deterministic DFS over sorted vertices and sorted outgoing edges. */
function findFirstCycle(edges: readonly DirectedEdge[]): DirectedCycle | null {
  const outgoing = new Map<number, DirectedEdge[]>();
  const vertices = new Set<number>();
  for (const edge of edges) {
    vertices.add(edge.source);
    vertices.add(edge.destination);
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
  }
  for (const sourceEdges of outgoing.values()) {
    sourceEdges.sort((left, right) => left.destination - right.destination);
  }

  // activePathEdges parallels activePathVertices: edge[i] leads from
  // vertex[i] to vertex[i + 1]. This makes back-edge extraction precise.
  const visited = new Set<number>();
  const activeVertices = new Set<number>();
  const activePathVertices: number[] = [];
  const activePathEdges: DirectedEdge[] = [];

  const visit = (current: number): DirectedCycle | null => {
    visited.add(current);
    activeVertices.add(current);
    activePathVertices.push(current);

    for (const edge of outgoing.get(current) ?? []) {
      if (activeVertices.has(edge.destination)) {
        // A back edge closes the cycle at the first occurrence of its target
        // in the active path; link IDs remain grouped by traversal edge.
        const cycleStart = activePathVertices.indexOf(edge.destination);
        const cycleEdges = [...activePathEdges.slice(cycleStart), edge];
        return {
          subgraphSystemIds: [
            ...activePathVertices.slice(cycleStart),
            edge.destination,
          ],
          dataLinkSystemIds: cycleEdges.flatMap(
            cycleEdge => cycleEdge.dataLinkSystemIds,
          ),
        };
      }
      if (visited.has(edge.destination)) continue;

      activePathEdges.push(edge);
      const cycle = visit(edge.destination);
      activePathEdges.pop();
      if (cycle !== null) return cycle;
    }

    activePathVertices.pop();
    activeVertices.delete(current);
    return null;
  };

  for (const start of [...vertices].sort((left, right) => left - right)) {
    if (visited.has(start)) continue;
    const cycle = visit(start);
    if (cycle !== null) return cycle;
  }
  return null;
}
