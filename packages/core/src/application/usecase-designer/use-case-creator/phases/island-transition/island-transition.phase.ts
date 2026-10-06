/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import {USECASE_TYPE} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {
  SubgraphPair,
  UseCase,
} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {
  DirectionCorrection,
  IslandTransition,
  UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {USECASE_TOPOLOGY_DECISION_KIND as TOPOLOGY_DECISION_KIND} from '../../contracts/routing-state.js';
import {
  buildEffectiveGraph,
  directedPairKey,
  findMdfBridgePath,
  hasControlLinkBetween,
  hasDirectedDataLink,
  sortedBySystemId,
  type EffectiveGraph,
} from './effective-graph.js';

function compareDirectedPairs(
  leftPair: SubgraphPair,
  rightPair: SubgraphPair,
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
  readonly pairs: readonly SubgraphPair[];
} {
  const corrections: DirectionCorrection[] = [];
  const pairs: SubgraphPair[] = [];

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
  const addedPairByKey = new Map<string, SubgraphPair>();

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

function collectIslandTransitionCandidates(
  usecases: readonly UseCase[],
  decisions: readonly UsecaseTopologyDecision[],
): readonly UseCase[] {
  const deletedUsecaseSystemIds = new Set(
    decisions
      .filter(
        decision =>
          decision.kind === TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      )
      .map(decision => decision.usecase.systemId),
  );
  const candidatesBySystemId = new Map(
    usecases
      .filter(
        usecase =>
          usecase.type === USECASE_TYPE.Island &&
          !deletedUsecaseSystemIds.has(usecase.systemId),
      )
      .map(usecase => [usecase.systemId, usecase]),
  );

  for (const decision of decisions) {
    if (
      decision.kind === TOPOLOGY_DECISION_KIND.TransitionToIsland &&
      !deletedUsecaseSystemIds.has(decision.usecase.systemId)
    ) {
      candidatesBySystemId.set(decision.usecase.systemId, decision.usecase);
    }
  }

  return [...candidatesBySystemId.values()];
}

/**
 * Re-evaluates existing islands and finalized Phase 2 island candidates against the effective graph.
 *
 * When a valid data-link path or MDF bridge is available, this phase prepares direction
 * corrections and added topology for a later LINKED transition. It does not change the
 * Phase 2 deletion-impact classification.
 */
export class IslandTransitionPhase {
  run(context: RoutingContext): Result<void> {
    const topologyChangeAnalysis = context.topologyChangeAnalysis;
    if (
      topologyChangeAnalysis === null ||
      context.input.mode === ROUTING_MODE.Manual
    ) {
      return Result.ok();
    }

    const effectiveGraph = buildEffectiveGraph(context.input.graphSnapshot);
    const eligibleIslandUsecases = sortedBySystemId(
      collectIslandTransitionCandidates(
        context.input.graphSnapshot.committedUsecases,
        topologyChangeAnalysis.decisions,
      ).filter(usecase =>
        isUsecaseWithinEffectiveScope(
          usecase,
          effectiveGraph.scopeSubgraphSystemIds,
        ),
      ),
    );
    if (eligibleIslandUsecases.length === 0) {
      return Result.ok();
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

    return Result.ok();
  }
}
