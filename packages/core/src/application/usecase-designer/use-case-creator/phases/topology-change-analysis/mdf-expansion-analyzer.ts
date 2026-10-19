/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import {
  MDF_TOPOLOGY_REWRITE_KIND,
  type MdfTopologyRewrite,
} from '../../contracts/routing-state.js';
import {
  compareDirectedEdges,
  type DirectedEdge,
  type TopologyImpactInventory,
} from './topology-impact-inventory.js';
import {unorderedPairKey} from '../../shared/usecase-topology.js';

/**
 * Normalizes links leaving one source into one candidate edge per destination.
 *
 * Multiple physical links may connect the current source to the same destination.
 * A destination is safe to traverse only when all of those links agree on EC
 * semantics: duplicate NORMAL or EC links produce one representative edge, while
 * a destination reachable through both NORMAL and EC links is omitted. This does
 * not establish that the overall MDF path is unique, nor does it require different
 * destinations to have the same semantics; those checks occur later in the search.
 */
function semanticallyUnambiguousEdges(
  edges: readonly DirectedEdge[],
): readonly DirectedEdge[] {
  const semanticsByDestination = new Map<number, Set<boolean>>();
  for (const edge of edges) {
    const semantics =
      semanticsByDestination.get(edge.destSubgraphSystemId) ??
      new Set<boolean>();
    semantics.add(edge.isEc);
    semanticsByDestination.set(edge.destSubgraphSystemId, semantics);
  }

  // A destination reachable as both NORMAL and EC has no single safe meaning.
  return [...semanticsByDestination.entries()]
    .filter(([, semantics]) => semantics.size === 1)
    .map(([destSubgraphSystemId, semantics]) => ({
      destSubgraphSystemId,
      isEc: [...semantics][0],
    }))
    .sort(compareDirectedEdges);
}

function canVisitCandidate(
  candidate: DirectedEdge,
  destinationId: number,
  requiredIsEc: boolean,
  visited: ReadonlySet<number>,
  visitedDestinations: ReadonlySet<number>,
  inventory: TopologyImpactInventory,
): boolean {
  // Every hop must preserve the deleted link's semantics. Only the requested
  // endpoint may be non-MDF; all intermediates must be MDF subgraphs.
  if (candidate.isEc !== requiredIsEc) return false;
  const nextId = candidate.destSubgraphSystemId;
  if (visitedDestinations.has(nextId) || visited.has(nextId)) return false;
  if (nextId === destinationId) return true;
  return inventory.routingSubgraphsById.get(nextId)?.isMdf === true;
}

function findStrictMdfPath(
  deletedDataLink: DataLink,
  inventory: TopologyImpactInventory,
): readonly number[] | null {
  const sourceId = deletedDataLink.sourceSubgraphSystemId;
  const destinationId = deletedDataLink.destSubgraphSystemId;
  const requiredIsEc = deletedDataLink.linkType === DATA_LINK_TYPE.Ec;

  if (
    !inventory.routingSubgraphsById.has(sourceId) ||
    !inventory.routingSubgraphsById.has(destinationId)
  ) {
    return null;
  }

  const maximumPathLength = Math.max(inventory.routingSubgraphsById.size, 1);
  const completePaths: number[][] = [];
  const currentPath = [sourceId];
  const visited = new Set<number>([sourceId]);

  const visit = (currentId: number): void => {
    if (completePaths.length > 1) return;
    if (currentId === destinationId) {
      // A direct source → destination path is not an MDF expansion.
      if (currentPath.length > 2) completePaths.push([...currentPath]);
      return;
    }
    // The graph-size bound is a final guard against an incomplete cycle check.
    if (currentPath.length >= maximumPathLength) return;

    const visitedDestinations = new Set<number>();
    const candidates = semanticallyUnambiguousEdges(
      inventory.routableAdjacency.get(currentId) ?? [],
    );

    for (const candidate of candidates) {
      if (completePaths.length > 1) return;
      const nextId = candidate.destSubgraphSystemId;
      if (
        !canVisitCandidate(
          candidate,
          destinationId,
          requiredIsEc,
          visited,
          visitedDestinations,
          inventory,
        )
      )
        continue;
      visitedDestinations.add(nextId);

      visited.add(nextId);
      currentPath.push(nextId);
      visit(nextId);
      currentPath.pop();
      visited.delete(nextId);
    }
  };

  visit(sourceId);
  // Ambiguous alternatives deliberately fall through to ordinary deletion handling.
  return completePaths.length === 1 ? completePaths[0] : null;
}

function buildRewrite(
  deletedDataLink: DataLink,
  path: readonly number[],
): MdfTopologyRewrite {
  return {
    kind: MDF_TOPOLOGY_REWRITE_KIND.DirectToMdf,
    directPair: {
      sourceSubgraphSystemId: deletedDataLink.sourceSubgraphSystemId,
      destSubgraphSystemId: deletedDataLink.destSubgraphSystemId,
    },
    // The original direct pair is replaced by the path's intermediate MDF chain.
    mdfSubgraphSystemIds: path.slice(1, -1),
    committedPairs: [
      {
        sourceSubgraphSystemId: deletedDataLink.sourceSubgraphSystemId,
        destSubgraphSystemId: deletedDataLink.destSubgraphSystemId,
      },
    ],
    normalizedPairs: path.slice(0, -1).map((sourceId, index) => ({
      sourceSubgraphSystemId: sourceId,
      destSubgraphSystemId: path[index + 1],
    })),
  };
}

/**
 * Recognizes one strict directed MDF expansion chain for a deleted data-link pair.
 *
 * The analyzer returns a rewrite only when the path is unique, every intermediate is
 * MDF, and all links preserve normal or EC semantics. Ambiguity returns `null`, allowing
 * Phase 2 to use ordinary fallback for the complete UseCase.
 */
export class MdfExpansionAnalyzer {
  analyze(
    deletedDataLink: DataLink,
    inventory: TopologyImpactInventory,
  ): MdfTopologyRewrite | null {
    // Existing surviving support means the deleted physical link did not remove
    // the logical pair, so an identity-preserving rewrite is unnecessary.
    const supportKey = unorderedPairKey(
      deletedDataLink.sourceSubgraphSystemId,
      deletedDataLink.destSubgraphSystemId,
    );
    if (
      inventory.survivingDataLinkPairKeys.has(supportKey) ||
      inventory.survivingControlLinkPairKeys.has(supportKey)
    ) {
      return null;
    }

    const path = findStrictMdfPath(deletedDataLink, inventory);
    return path === null ? null : buildRewrite(deletedDataLink, path);
  }
}
