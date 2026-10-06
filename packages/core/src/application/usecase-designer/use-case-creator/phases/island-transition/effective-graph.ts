/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {RoutingGraphSnapshot} from '../../contracts/routing-input.js';

export interface EffectiveGraph {
  readonly scopeSubgraphSystemIds: ReadonlySet<number>;
  readonly mdfSubgraphSystemIds: ReadonlySet<number>;
  readonly directedDataLinkKeys: ReadonlySet<string>;
  readonly controlLinkPairKeys: ReadonlySet<string>;
  readonly dataLinkDestinationsBySource: ReadonlyMap<number, readonly number[]>;
}

export function directedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}:${destSubgraphSystemId}`;
}

function unorderedPairKey(
  firstSubgraphSystemId: number,
  secondSubgraphSystemId: number,
): string {
  return firstSubgraphSystemId < secondSubgraphSystemId
    ? `${firstSubgraphSystemId}:${secondSubgraphSystemId}`
    : `${secondSubgraphSystemId}:${firstSubgraphSystemId}`;
}

export function sortedBySystemId<T extends {readonly systemId: number}>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (leftItem, rightItem) => leftItem.systemId - rightItem.systemId,
  );
}

function addDataLinkToGraph(
  dataLink: DataLink,
  scopeSubgraphSystemIds: ReadonlySet<number>,
  directedDataLinkKeys: Set<string>,
  destinationsBySource: Map<number, Set<number>>,
): void {
  if (
    !scopeSubgraphSystemIds.has(dataLink.sourceSubgraphSystemId) ||
    !scopeSubgraphSystemIds.has(dataLink.destSubgraphSystemId)
  ) {
    return;
  }

  directedDataLinkKeys.add(
    directedPairKey(
      dataLink.sourceSubgraphSystemId,
      dataLink.destSubgraphSystemId,
    ),
  );
  const destinations =
    destinationsBySource.get(dataLink.sourceSubgraphSystemId) ??
    new Set<number>();
  destinations.add(dataLink.destSubgraphSystemId);
  destinationsBySource.set(dataLink.sourceSubgraphSystemId, destinations);
}

function addControlLinkToGraph(
  controlLink: ControlLink,
  scopeSubgraphSystemIds: ReadonlySet<number>,
  controlLinkPairKeys: Set<string>,
): void {
  if (
    !scopeSubgraphSystemIds.has(controlLink.sourceSubgraphSystemId) ||
    !scopeSubgraphSystemIds.has(controlLink.destSubgraphSystemId)
  ) {
    return;
  }

  controlLinkPairKeys.add(
    unorderedPairKey(
      controlLink.sourceSubgraphSystemId,
      controlLink.destSubgraphSystemId,
    ),
  );
}

export function buildEffectiveGraph(
  snapshot: RoutingGraphSnapshot,
): EffectiveGraph {
  const scopeSubgraphSystemIds = new Set(
    snapshot.subgraphs.map(
      routingSubgraph => routingSubgraph.subgraph.systemId,
    ),
  );
  const mdfSubgraphSystemIds = new Set(
    snapshot.subgraphs
      .filter(routingSubgraph => routingSubgraph.isMdf)
      .map(routingSubgraph => routingSubgraph.subgraph.systemId),
  );
  const directedDataLinkKeys = new Set<string>();
  const controlLinkPairKeys = new Set<string>();
  const destinationsBySource = new Map<number, Set<number>>();

  for (const dataLink of sortedBySystemId(snapshot.routableDataLinks)) {
    addDataLinkToGraph(
      dataLink,
      scopeSubgraphSystemIds,
      directedDataLinkKeys,
      destinationsBySource,
    );
  }
  for (const controlLink of sortedBySystemId(snapshot.routableControlLinks)) {
    addControlLinkToGraph(
      controlLink,
      scopeSubgraphSystemIds,
      controlLinkPairKeys,
    );
  }

  const dataLinkDestinationsBySource = new Map<number, readonly number[]>();
  for (const [sourceSubgraphSystemId, destinations] of destinationsBySource) {
    dataLinkDestinationsBySource.set(
      sourceSubgraphSystemId,
      [...destinations].sort((leftId, rightId) => leftId - rightId),
    );
  }

  return {
    scopeSubgraphSystemIds,
    mdfSubgraphSystemIds,
    directedDataLinkKeys,
    controlLinkPairKeys,
    dataLinkDestinationsBySource,
  };
}

export function hasDirectedDataLink(
  effectiveGraph: EffectiveGraph,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): boolean {
  return effectiveGraph.directedDataLinkKeys.has(
    directedPairKey(sourceSubgraphSystemId, destSubgraphSystemId),
  );
}

export function hasControlLinkBetween(
  effectiveGraph: EffectiveGraph,
  firstSubgraphSystemId: number,
  secondSubgraphSystemId: number,
): boolean {
  return effectiveGraph.controlLinkPairKeys.has(
    unorderedPairKey(firstSubgraphSystemId, secondSubgraphSystemId),
  );
}

export function findMdfBridgePath(
  effectiveGraph: EffectiveGraph,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): readonly number[] | null {
  if (
    !effectiveGraph.scopeSubgraphSystemIds.has(sourceSubgraphSystemId) ||
    !effectiveGraph.scopeSubgraphSystemIds.has(destSubgraphSystemId)
  ) {
    return null;
  }

  const maxPathLength = Math.max(effectiveGraph.scopeSubgraphSystemIds.size, 1);
  const currentPath = [sourceSubgraphSystemId];
  const branchVisitedSubgraphSystemIds = new Set([sourceSubgraphSystemId]);

  const visit = (currentSubgraphSystemId: number): readonly number[] | null => {
    if (currentSubgraphSystemId === destSubgraphSystemId) {
      return [...currentPath];
    }
    if (currentPath.length >= maxPathLength) return null;

    for (const nextSubgraphSystemId of effectiveGraph.dataLinkDestinationsBySource.get(
      currentSubgraphSystemId,
    ) ?? []) {
      if (
        !effectiveGraph.scopeSubgraphSystemIds.has(nextSubgraphSystemId) ||
        branchVisitedSubgraphSystemIds.has(nextSubgraphSystemId) ||
        (nextSubgraphSystemId !== destSubgraphSystemId &&
          !effectiveGraph.mdfSubgraphSystemIds.has(nextSubgraphSystemId))
      ) {
        continue;
      }

      branchVisitedSubgraphSystemIds.add(nextSubgraphSystemId);
      currentPath.push(nextSubgraphSystemId);
      const completedPath = visit(nextSubgraphSystemId);
      if (completedPath !== null) return completedPath;
      currentPath.pop();
      branchVisitedSubgraphSystemIds.delete(nextSubgraphSystemId);
    }
    return null;
  };

  return visit(sourceSubgraphSystemId);
}
