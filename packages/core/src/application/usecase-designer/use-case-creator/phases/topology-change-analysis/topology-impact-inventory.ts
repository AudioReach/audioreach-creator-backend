/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {
  RoutingGraphSnapshot,
  RoutingSubgraph,
} from '../../contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';

export function unorderedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  // Support is an undirected property: either data-link direction or any control-link
  // direction keeps the stored pair structurally supported.
  const low = Math.min(sourceSubgraphSystemId, destSubgraphSystemId);
  const high = Math.max(sourceSubgraphSystemId, destSubgraphSystemId);
  return `${low}<->${high}`;
}

export function directedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}->${destSubgraphSystemId}`;
}

export function sortedBySystemId<T extends {readonly systemId: number}>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => left.systemId - right.systemId);
}

export function sortedIds(ids: readonly number[]): number[] {
  return [...ids].sort((left, right) => left - right);
}

export function compareDirectedEdges(
  left: DirectedEdge,
  right: DirectedEdge,
): number {
  return (
    left.destSubgraphSystemId - right.destSubgraphSystemId ||
    Number(left.isEc) - Number(right.isEc)
  );
}

function indexUsecasesBySubgraph(
  usecases: readonly UseCase[],
): ReadonlyMap<number, readonly UseCase[]> {
  const index = new Map<number, UseCase[]>();
  for (const usecase of sortedBySystemId(usecases)) {
    for (const subgraphSystemId of usecase.subgraphSystemIds) {
      const entries = index.get(subgraphSystemId) ?? [];
      entries.push(usecase);
      index.set(subgraphSystemId, entries);
    }
  }
  return new Map(
    [...index.entries()]
      .sort(([left], [right]) => left - right)
      .map(([key, values]) => [
        key,
        [...values].sort((left, right) => left.systemId - right.systemId),
      ]),
  );
}

function indexLinksByPair(
  links: readonly (DataLink | ControlLink)[],
  deletedSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  // Overlay links describe file-wide surviving support. Request-only exclusions are
  // deliberately absent here because they must not create a false deletion impact.
  const pairs = new Set<string>();
  for (const link of sortedBySystemId(links)) {
    if (deletedSystemIds.has(link.systemId)) continue;
    pairs.add(
      unorderedPairKey(link.sourceSubgraphSystemId, link.destSubgraphSystemId),
    );
  }
  return pairs;
}

function buildDirectedAdjacency(
  dataLinks: readonly DataLink[],
  deletedDataLinkSystemIds: ReadonlySet<number>,
): ReadonlyMap<number, readonly DirectedEdge[]> {
  // Reconstruction uses the already-filtered routable snapshot, not the overlay catalog.
  // The EC flag is retained so legacy EC boundaries can be opened or guarded per UC.
  const adjacencyBySourceSubgraphId = new Map<
    number,
    Map<string, DirectedEdge>
  >();
  for (const link of sortedBySystemId(dataLinks)) {
    if (deletedDataLinkSystemIds.has(link.systemId)) continue;
    const destinations =
      adjacencyBySourceSubgraphId.get(link.sourceSubgraphSystemId) ??
      new Map<string, DirectedEdge>();
    const isEc = link.linkType === DATA_LINK_TYPE.Ec;
    destinations.set(`${link.destSubgraphSystemId}:${Number(isEc)}`, {
      destSubgraphSystemId: link.destSubgraphSystemId,
      isEc,
    });
    adjacencyBySourceSubgraphId.set(link.sourceSubgraphSystemId, destinations);
  }
  return new Map(
    [...adjacencyBySourceSubgraphId.entries()].map(([source, destinations]) => [
      source,
      [...destinations.values()].sort(compareDirectedEdges),
    ]),
  );
}

function indexCommittedUsecasesByDirectedPair(
  usecases: readonly UseCase[],
): ReadonlyMap<string, readonly UseCase[]> {
  const index = new Map<string, UseCase[]>();
  for (const usecase of sortedBySystemId(usecases)) {
    for (const pair of usecase.subgraphPairs) {
      const key = directedPairKey(
        pair.sourceSubgraphSystemId,
        pair.destSubgraphSystemId,
      );
      const entries = index.get(key) ?? [];
      entries.push(usecase);
      index.set(key, entries);
    }
  }
  return new Map(
    [...index.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, {numeric: true}),
      )
      .map(([key, values]) => [
        key,
        [...values].sort((left, right) => left.systemId - right.systemId),
      ]),
  );
}

/**
 * Builds the immutable Phase 2 lookup view from the handler-created graph snapshot.
 * Full overlay links establish physical pair support; request-scoped routable links
 * establish paths that this routing request may actually use.
 */
export function buildTopologyImpactInventory(
  snapshot: RoutingGraphSnapshot,
): TopologyImpactInventory {
  const deletedSubgraphSystemIds = new Set(
    sortedIds(
      snapshot.sessionEdits.deletedSgs.map(subgraph => subgraph.systemId),
    ),
  );
  const deletedDataLinkSystemIds = new Set(
    snapshot.sessionEdits.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    snapshot.sessionEdits.deletedControlLinks.map(link => link.systemId),
  );
  const committedUsecasesBySubgraph = indexUsecasesBySubgraph(
    snapshot.committedUsecases,
  );
  const adjacency = buildDirectedAdjacency(
    snapshot.routableDataLinks,
    deletedDataLinkSystemIds,
  );
  const routingSubgraphsById = new Map(
    [...snapshot.subgraphs]
      .sort((left, right) => left.subgraph.systemId - right.subgraph.systemId)
      .map(item => [item.subgraph.systemId, item] as const),
  );
  return {
    committedUsecasesByDirectedPair: indexCommittedUsecasesByDirectedPair(
      snapshot.committedUsecases,
    ),
    committedUsecasesBySubgraph,
    deletedDataLinks: sortedBySystemId(snapshot.sessionEdits.deletedDataLinks),
    deletedControlLinks: sortedBySystemId(
      snapshot.sessionEdits.deletedControlLinks,
    ),
    deletedSubgraphSystemIds,
    survivingDataLinkPairKeys: indexLinksByPair(
      snapshot.overlayDataLinks,
      deletedDataLinkSystemIds,
    ),
    survivingControlLinkPairKeys: indexLinksByPair(
      snapshot.overlayControlLinks,
      deletedControlLinkSystemIds,
    ),
    routableAdjacency: new Map(
      [...adjacency.entries()].sort(([left], [right]) => left - right),
    ) as ReadonlyMap<number, readonly DirectedEdge[]>,
    routingSubgraphsById,
  };
}

/**
 * One outgoing adjacency entry used by Phase 2 path analysis. The source is the enclosing
 * `routableAdjacency` map key, so each entry stores only its destination and EC semantics.
 */
export interface DirectedEdge {
  readonly destSubgraphSystemId: number;
  readonly isEc: boolean;
}

/**
 * Immutable Phase 2 lookup view shared with MDF analysis and deletion reconstruction.
 * Full overlay support and request-scoped routable adjacency remain separate to prevent
 * request exclusions from creating false deletion impact.
 */
export interface TopologyImpactInventory {
  readonly committedUsecasesByDirectedPair: ReadonlyMap<
    string,
    readonly UseCase[]
  >;
  readonly committedUsecasesBySubgraph: ReadonlyMap<number, readonly UseCase[]>;
  readonly deletedDataLinks: readonly DataLink[];
  readonly deletedControlLinks: readonly ControlLink[];
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly survivingDataLinkPairKeys: ReadonlySet<string>;
  readonly survivingControlLinkPairKeys: ReadonlySet<string>;
  readonly routableAdjacency: ReadonlyMap<number, readonly DirectedEdge[]>;
  readonly routingSubgraphsById: ReadonlyMap<number, RoutingSubgraph>;
}
