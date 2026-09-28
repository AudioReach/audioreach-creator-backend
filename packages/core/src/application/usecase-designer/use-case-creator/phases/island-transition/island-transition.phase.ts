/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {
  DirectionCorrection,
  IslandTransition,
  TransitionToIslandDecision,
} from '../../contracts/routing-state.js';
import {USECASE_TOPOLOGY_DECISION_KIND as TOPOLOGY_DECISION_KIND} from '../../contracts/routing-state.js';
import {
  buildEffectiveGraph,
  directedPairKey,
  findMdfBridgePath,
  hasControlLinkBetween,
  hasDirectedDataLink,
  type EffectiveGraph,
} from './effective-graph.js';

interface DirectedPair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
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

/**
 * Re-evaluates finalized island decisions against the effective graph.
 *
 * When a valid data-link path or MDF bridge is available, this phase prepares direction
 * corrections and added topology for a later LINKED transition. It does not change the
 * Phase 2 deletion-impact classification.
 */
export class IslandTransitionPhase {
  run(context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    const topologyChangeAnalysis = context.topologyChangeAnalysis;
    if (
      topologyChangeAnalysis === null ||
      context.input.mode === ROUTING_MODE.Manual
    ) {
      return Promise.resolve(Result.ok());
    }

    const effectiveGraph = buildEffectiveGraph(context.input.graphSnapshot);
    const islandDecisions = topologyChangeAnalysis.decisions.filter(
      (decision): decision is TransitionToIslandDecision =>
        decision.kind === TOPOLOGY_DECISION_KIND.TransitionToIsland,
    );
    const eligibleIslandUsecases = sortedBySystemId(
      islandDecisions
        .map(decision => decision.usecase)
        .filter(
          usecase =>
            usecase.type === 'ISLAND' &&
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
