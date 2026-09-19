/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {
  DirectionCorrection,
  IslandTransition,
} from '../contracts/routing-state.js';

interface DirectedPair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

interface EffectiveGraph {
  readonly scopeSubgraphSystemIds: ReadonlySet<number>;
  readonly mdfSubgraphSystemIds: ReadonlySet<number>;
  readonly directedDataLinkKeys: ReadonlySet<string>;
  readonly controlLinkPairKeys: ReadonlySet<string>;
  readonly dataLinkDestinationsBySource: ReadonlyMap<number, readonly number[]>;
}

function directedPairKey(
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

function compareDirectedPairs(
  leftPair: DirectedPair,
  rightPair: DirectedPair,
): number {
  return (
    leftPair.sourceSubgraphSystemId - rightPair.sourceSubgraphSystemId ||
    leftPair.destSubgraphSystemId - rightPair.destSubgraphSystemId
  );
}

function compareDirectionCorrections(
  leftCorrection: DirectionCorrection,
  rightCorrection: DirectionCorrection,
): number {
  return (
    leftCorrection.currentSourceSubgraphSystemId -
      rightCorrection.currentSourceSubgraphSystemId ||
    leftCorrection.currentDestSubgraphSystemId -
      rightCorrection.currentDestSubgraphSystemId ||
    leftCorrection.newSourceSubgraphSystemId -
      rightCorrection.newSourceSubgraphSystemId ||
    leftCorrection.newDestSubgraphSystemId -
      rightCorrection.newDestSubgraphSystemId
  );
}

function sortedBySystemId<T extends {readonly systemId: number}>(
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

function buildEffectiveGraph(context: RoutingContext): EffectiveGraph {
  const scopeSubgraphSystemIds = new Set(
    context.input.graphSnapshot.subgraphs.map(
      routingSubgraph => routingSubgraph.subgraph.systemId,
    ),
  );
  const mdfSubgraphSystemIds = new Set(
    context.input.graphSnapshot.subgraphs
      .filter(routingSubgraph => routingSubgraph.isMdf)
      .map(routingSubgraph => routingSubgraph.subgraph.systemId),
  );
  const directedDataLinkKeys = new Set<string>();
  const controlLinkPairKeys = new Set<string>();
  const destinationsBySource = new Map<number, Set<number>>();

  for (const dataLink of sortedBySystemId(
    context.input.graphSnapshot.routableDataLinks,
  )) {
    addDataLinkToGraph(
      dataLink,
      scopeSubgraphSystemIds,
      directedDataLinkKeys,
      destinationsBySource,
    );
  }
  for (const controlLink of sortedBySystemId(
    context.input.graphSnapshot.routableControlLinks,
  )) {
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

function hasDirectedDataLink(
  effectiveGraph: EffectiveGraph,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): boolean {
  return effectiveGraph.directedDataLinkKeys.has(
    directedPairKey(sourceSubgraphSystemId, destSubgraphSystemId),
  );
}

function hasControlLinkBetween(
  effectiveGraph: EffectiveGraph,
  firstSubgraphSystemId: number,
  secondSubgraphSystemId: number,
): boolean {
  return effectiveGraph.controlLinkPairKeys.has(
    unorderedPairKey(firstSubgraphSystemId, secondSubgraphSystemId),
  );
}

function findMdfBridgePath(
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

function isUsecaseWithinEffectiveScope(
  usecase: Pick<UseCase, 'subgraphSystemIds' | 'subgraphPairs'>,
  scopeSubgraphSystemIds: ReadonlySet<number>,
): boolean {
  const relevantSubgraphSystemIds = new Set(usecase.subgraphSystemIds);
  for (const storedPair of usecase.subgraphPairs) {
    relevantSubgraphSystemIds.add(storedPair.sourceSubgraphSystemId);
    relevantSubgraphSystemIds.add(storedPair.destSubgraphSystemId);
  }
  return [...relevantSubgraphSystemIds].every(subgraphSystemId =>
    scopeSubgraphSystemIds.has(subgraphSystemId),
  );
}

function buildCorrectedPairs(
  usecase: Pick<UseCase, 'subgraphPairs'>,
  effectiveGraph: EffectiveGraph,
): {
  readonly corrections: readonly DirectionCorrection[];
  readonly pairs: readonly DirectedPair[];
} {
  const corrections: DirectionCorrection[] = [];
  const pairs: DirectedPair[] = [];

  for (const storedPair of usecase.subgraphPairs) {
    const hasForwardDataLink = hasDirectedDataLink(
      effectiveGraph,
      storedPair.sourceSubgraphSystemId,
      storedPair.destSubgraphSystemId,
    );
    const hasReverseDataLink = hasDirectedDataLink(
      effectiveGraph,
      storedPair.destSubgraphSystemId,
      storedPair.sourceSubgraphSystemId,
    );
    const shouldCorrectDirection =
      !hasForwardDataLink &&
      hasReverseDataLink &&
      hasControlLinkBetween(
        effectiveGraph,
        storedPair.sourceSubgraphSystemId,
        storedPair.destSubgraphSystemId,
      );

    if (shouldCorrectDirection) {
      corrections.push({
        currentSourceSubgraphSystemId: storedPair.sourceSubgraphSystemId,
        currentDestSubgraphSystemId: storedPair.destSubgraphSystemId,
        newSourceSubgraphSystemId: storedPair.destSubgraphSystemId,
        newDestSubgraphSystemId: storedPair.sourceSubgraphSystemId,
      });
      pairs.push({
        sourceSubgraphSystemId: storedPair.destSubgraphSystemId,
        destSubgraphSystemId: storedPair.sourceSubgraphSystemId,
      });
      continue;
    }

    pairs.push({
      sourceSubgraphSystemId: storedPair.sourceSubgraphSystemId,
      destSubgraphSystemId: storedPair.destSubgraphSystemId,
    });
  }

  corrections.sort(compareDirectionCorrections);
  return {corrections, pairs};
}

function evaluateIslandUsecase(
  usecase: UseCase,
  effectiveGraph: EffectiveGraph,
): IslandTransition | null {
  const {corrections, pairs: correctedPairs} = buildCorrectedPairs(
    usecase,
    effectiveGraph,
  );
  const addedSubgraphSystemIds = new Set<number>();
  const addedPairByKey = new Map<string, DirectedPair>();

  for (const correctedPair of correctedPairs) {
    if (
      hasDirectedDataLink(
        effectiveGraph,
        correctedPair.sourceSubgraphSystemId,
        correctedPair.destSubgraphSystemId,
      )
    ) {
      continue;
    }

    const bridgePath = findMdfBridgePath(
      effectiveGraph,
      correctedPair.sourceSubgraphSystemId,
      correctedPair.destSubgraphSystemId,
    );
    if (bridgePath === null) return null;

    for (let pathIndex = 1; pathIndex < bridgePath.length - 1; pathIndex++) {
      addedSubgraphSystemIds.add(bridgePath[pathIndex]);
    }
    for (let pathIndex = 0; pathIndex < bridgePath.length - 1; pathIndex++) {
      const sourceSubgraphSystemId = bridgePath[pathIndex];
      const destSubgraphSystemId = bridgePath[pathIndex + 1];
      addedPairByKey.set(
        directedPairKey(sourceSubgraphSystemId, destSubgraphSystemId),
        {sourceSubgraphSystemId, destSubgraphSystemId},
      );
    }
  }

  return {
    usecase,
    directionCorrections: corrections,
    addedSubgraphSystemIds: [...addedSubgraphSystemIds].sort(
      (leftId, rightId) => leftId - rightId,
    ),
    addedPairs: [...addedPairByKey.values()].sort(compareDirectedPairs),
  };
}

export class IslandTransitionService {
  run(context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    const deletionAnalysis = context.deletionAnalysis;
    if (
      deletionAnalysis === null ||
      context.input.mode === ROUTING_MODE.Manual
    ) {
      return Promise.resolve(Result.ok());
    }

    const effectiveGraph = buildEffectiveGraph(context);
    const markedForDeletionSystemIds = new Set(
      deletionAnalysis.markedForDeletion.map(
        deletionMark => deletionMark.usecase.systemId,
      ),
    );
    const eligibleIslandUsecases = sortedBySystemId(
      context.input.graphSnapshot.committedUsecases.filter(
        usecase =>
          usecase.type === 'ISLAND' &&
          !markedForDeletionSystemIds.has(usecase.systemId) &&
          isUsecaseWithinEffectiveScope(
            usecase,
            effectiveGraph.scopeSubgraphSystemIds,
          ),
      ),
    );
    if (eligibleIslandUsecases.length === 0) {
      return Promise.resolve(Result.ok());
    }

    const completeTransitions: IslandTransition[] = [];
    for (const usecase of eligibleIslandUsecases) {
      const transition = evaluateIslandUsecase(usecase, effectiveGraph);
      if (transition !== null) completeTransitions.push(transition);
    }

    const existingTransitionSystemIds = new Set(
      context.islandTransitions.map(transition => transition.usecase.systemId),
    );
    for (const transition of completeTransitions) {
      if (!existingTransitionSystemIds.has(transition.usecase.systemId)) {
        context.islandTransitions.push(transition);
        existingTransitionSystemIds.add(transition.usecase.systemId);
      }
    }
    context.islandTransitions.sort(
      (leftTransition, rightTransition) =>
        leftTransition.usecase.systemId - rightTransition.usecase.systemId,
    );

    return Promise.resolve(Result.ok());
  }
}
