/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {MdfPairSubstitution} from '../contracts/routing-state.js';
import type {
  DirectedEdge,
  TopologyImpactInventory,
} from '../contracts/topology-impact-inventory.js';

function unorderedPairKey(firstId: number, secondId: number): string {
  const low = Math.min(firstId, secondId);
  const high = Math.max(firstId, secondId);
  return `${low}<->${high}`;
}

function compareEdges(left: DirectedEdge, right: DirectedEdge): number {
  return (
    left.destSubgraphSystemId - right.destSubgraphSystemId ||
    Number(left.isEc) - Number(right.isEc)
  );
}

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

  return [...semanticsByDestination.entries()]
    .filter(([, semantics]) => semantics.size === 1)
    .map(([destSubgraphSystemId, semantics]) => ({
      destSubgraphSystemId,
      isEc: [...semantics][0],
    }))
    .sort(compareEdges);
}

function canVisitCandidate(
  candidate: DirectedEdge,
  destinationId: number,
  requiredIsEc: boolean,
  visited: ReadonlySet<number>,
  visitedDestinations: ReadonlySet<number>,
  inventory: TopologyImpactInventory,
): boolean {
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
      if (currentPath.length > 2) completePaths.push([...currentPath]);
      return;
    }
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
  return completePaths.length === 1 ? completePaths[0] : null;
}

function buildSubstitution(
  deletedDataLink: DataLink,
  path: readonly number[],
): MdfPairSubstitution {
  return {
    removedPair: {
      sourceSubgraphSystemId: deletedDataLink.sourceSubgraphSystemId,
      destSubgraphSystemId: deletedDataLink.destSubgraphSystemId,
    },
    replacementSubgraphSystemIds: path.slice(1, -1),
    replacementPairs: path.slice(0, -1).map((sourceId, index) => ({
      sourceSubgraphSystemId: sourceId,
      destSubgraphSystemId: path[index + 1],
    })),
  };
}

/**
 * Recognizes one strict directed replacement chain for a deleted data-link pair.
 *
 * The analyzer returns a substitution only when the path is unique, every intermediate is
 * MDF, and all links preserve normal or EC semantics. Ambiguity returns `null`, allowing
 * Phase 2 to use ordinary fallback for the complete UseCase.
 */
export class MdfSubstitutionAnalyzer {
  analyze(
    deletedDataLink: DataLink,
    inventory: TopologyImpactInventory,
  ): MdfPairSubstitution | null {
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
    return path === null ? null : buildSubstitution(deletedDataLink, path);
  }
}
