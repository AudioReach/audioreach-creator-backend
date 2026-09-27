/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {
  ClassifiedUsecase,
  InteriorExtensionClassification,
  RoutingCombination,
  UsecaseStructuralChange,
  UsecaseTopologyDecision,
} from '../contracts/routing-state.js';
import {USECASE_TOPOLOGY_DECISION_KIND as TOPOLOGY_DECISION_KIND} from '../contracts/routing-state.js';

/**
 * Session-wide read model composed from committed UCs and finalized routing changes.
 * Unlike `UsecaseStructuralChange`, this contains no persistence delta for one aggregate.
 */
export interface ProjectedUsecaseTopology {
  readonly usecases: readonly UseCase[];
  readonly subgraphSystemIds: ReadonlySet<number>;
  readonly directedPairKeys: ReadonlySet<string>;
  readonly unorderedPairKeys: ReadonlySet<string>;
}

export function directedProjectedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}>${destSubgraphSystemId}`;
}

export function unorderedProjectedPairKey(
  firstSubgraphSystemId: number,
  secondSubgraphSystemId: number,
): string {
  return [firstSubgraphSystemId, secondSubgraphSystemId]
    .sort((left, right) => left - right)
    .join('>');
}

function cloneUsecase(
  usecase: UseCase,
  subgraphSystemIds: readonly number[] = usecase.subgraphSystemIds,
  subgraphPairs: readonly SubgraphPair[] = usecase.subgraphPairs,
  type = usecase.type,
): UseCase {
  return new UseCase({
    systemId: usecase.systemId,
    fileSystemId: usecase.fileSystemId,
    keyVector: {valueSystemIds: [...usecase.keyVector.valueSystemIds]},
    alias: usecase.alias,
    aliasId: usecase.aliasId,
    categories: usecase.categories ? [...usecase.categories] : undefined,
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: subgraphPairs.map(pair => ({...pair})),
    type,
    orderedKeys: usecase.orderedKeys?.map(key => ({...key})),
  });
}

/**
 * Materializes one finalized aggregate change as a cloned UseCase. This does not build the
 * session-wide `ProjectedUsecaseTopology`; callers compose that broader read model separately.
 */
export function projectUsecaseStructure(
  usecase: UseCase,
  structuralChange: UsecaseStructuralChange,
): UseCase {
  return cloneUsecase(
    usecase,
    structuralChange.resultingSubgraphSystemIds,
    structuralChange.resultingPairs,
    structuralChange.resultingType,
  );
}

export function projectCommittedUcsWithMdfSubstitutions(
  context: RoutingContext,
): readonly UseCase[] {
  const analysis = context.topologyChangeAnalysis;
  if (analysis === null) {
    throw new Error('Topology change analysis must run before classification');
  }

  const structuralChanges = new Map(
    analysis.decisions
      .filter(
        (
          decision,
        ): decision is Extract<
          (typeof analysis.decisions)[number],
          {readonly kind: typeof TOPOLOGY_DECISION_KIND.MdfSubstitution}
        > => decision.kind === TOPOLOGY_DECISION_KIND.MdfSubstitution,
      )
      .map(
        decision =>
          [decision.usecase.systemId, decision.structuralChange] as const,
      ),
  );

  return context.input.graphSnapshot.committedUsecases
    .map(usecase => {
      const structuralChange = structuralChanges.get(usecase.systemId);
      return structuralChange === undefined
        ? usecase
        : projectUsecaseStructure(usecase, structuralChange);
    })
    .sort((left, right) => left.systemId - right.systemId);
}

function candidateUsecase(
  candidate: RoutingCombination,
  fileSystemId: number,
  systemId: number,
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId,
    keyVector: {
      valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
    },
    subgraphSystemIds: [...candidate.path.subgraphSystemIds],
    subgraphPairs: adjacentPairs(candidate.path.subgraphSystemIds),
  });
}

function adjacentPairs(subgraphSystemIds: readonly number[]): SubgraphPair[] {
  return subgraphSystemIds.slice(1).map((dest, index) => ({
    sourceSubgraphSystemId: subgraphSystemIds[index],
    destSubgraphSystemId: dest,
  }));
}

function withMergedTopology(
  usecase: UseCase,
  subgraphSystemIds: readonly number[],
  subgraphPairs: readonly SubgraphPair[],
): UseCase {
  return cloneUsecase(
    usecase,
    [...new Set([...usecase.subgraphSystemIds, ...subgraphSystemIds])],
    uniquePairs([...usecase.subgraphPairs, ...subgraphPairs]),
  );
}

function uniquePairs(pairs: readonly SubgraphPair[]): SubgraphPair[] {
  const seen = new Set<string>();
  return pairs.filter(pair => {
    const key = directedProjectedPairKey(
      pair.sourceSubgraphSystemId,
      pair.destSubgraphSystemId,
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyInteriorExtension(
  projected: Map<number, UseCase>,
  classification: InteriorExtensionClassification,
): void {
  const current =
    projected.get(classification.existingUsecase.systemId) ??
    classification.existingUsecase;
  projected.set(
    current.systemId,
    withMergedTopology(
      current,
      classification.candidate.path.subgraphSystemIds,
      adjacentPairs(classification.candidate.path.subgraphSystemIds),
    ),
  );
}

function applyClassifiedUsecase(
  projected: Map<number, UseCase>,
  classification: ClassifiedUsecase,
  fileSystemId: number,
): void {
  if (classification.kind === 'EXACT_MATCH') return;
  if (classification.kind === 'INTERIOR_EXTENSION') {
    applyInteriorExtension(projected, classification);
    return;
  }
  const systemId = -1 - projected.size;
  const candidate = candidateUsecase(
    classification.candidate,
    fileSystemId,
    -Math.abs(systemId),
  );
  projected.set(candidate.systemId, candidate);
}

function applyPreserveDecision(
  projected: Map<number, UseCase>,
  decision: Extract<UsecaseTopologyDecision, {kind: 'PRESERVE'}>,
): void {
  const current = projected.get(decision.usecase.systemId);
  if (!current) return;
  const dropped = new Set(decision.droppedSubgraphSystemIds);
  projected.set(
    current.systemId,
    cloneUsecase(
      current,
      current.subgraphSystemIds.filter(id => !dropped.has(id)),
      current.subgraphPairs.filter(
        pair =>
          !dropped.has(pair.sourceSubgraphSystemId) &&
          !dropped.has(pair.destSubgraphSystemId),
      ),
    ),
  );
}

function applyTopologyDecision(
  projected: Map<number, UseCase>,
  decision: UsecaseTopologyDecision,
): void {
  switch (decision.kind) {
    case TOPOLOGY_DECISION_KIND.MdfSubstitution: {
      const current = projected.get(decision.usecase.systemId);
      if (current !== undefined)
        projected.set(
          current.systemId,
          projectUsecaseStructure(current, decision.structuralChange),
        );
      return;
    }
    case TOPOLOGY_DECISION_KIND.TransitionToIsland: {
      const current = projected.get(decision.usecase.systemId);
      if (current === undefined) return;
      const dropped = new Set(decision.droppedSubgraphSystemIds);
      projected.set(
        current.systemId,
        cloneUsecase(
          current,
          current.subgraphSystemIds.filter(id => !dropped.has(id)),
          current.subgraphPairs.filter(
            pair =>
              !dropped.has(pair.sourceSubgraphSystemId) &&
              !dropped.has(pair.destSubgraphSystemId),
          ),
          USECASE_TYPE.Island,
        ),
      );
      return;
    }
    case TOPOLOGY_DECISION_KIND.DeleteOrReconstruct:
      projected.delete(decision.usecase.systemId);
      return;
    case TOPOLOGY_DECISION_KIND.Preserve:
      applyPreserveDecision(projected, decision);
      return;
  }
}

function applyIslandTransition(
  projected: Map<number, UseCase>,
  transition: RoutingContext['islandTransitions'][number],
): void {
  const current = projected.get(transition.usecase.systemId);
  if (!current) return;
  const corrections = new Map(
    transition.directionCorrections.map(correction => [
      directedProjectedPairKey(
        correction.currentSourceSubgraphSystemId,
        correction.currentDestSubgraphSystemId,
      ),
      {
        sourceSubgraphSystemId: correction.newSourceSubgraphSystemId,
        destSubgraphSystemId: correction.newDestSubgraphSystemId,
      },
    ]),
  );
  const pairs = current.subgraphPairs.map(
    pair =>
      corrections.get(
        directedProjectedPairKey(
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ),
      ) ?? pair,
  );
  projected.set(
    current.systemId,
    cloneUsecase(
      current,
      [
        ...new Set([
          ...current.subgraphSystemIds,
          ...transition.addedSubgraphSystemIds,
        ]),
      ],
      uniquePairs([...pairs, ...transition.addedPairs]),
    ),
  );
}

function applyFinalizedTopologyChanges(
  context: RoutingContext,
  projected: Map<number, UseCase>,
): void {
  for (const decision of context.topologyChangeAnalysis?.decisions ?? [])
    applyTopologyDecision(projected, decision);
  for (const transition of context.islandTransitions)
    applyIslandTransition(projected, transition);
}

export function buildProjectedUsecaseTopology(
  context: RoutingContext,
): ProjectedUsecaseTopology {
  const projected = new Map<number, UseCase>();
  for (const usecase of context.input.graphSnapshot.committedUsecases)
    projected.set(usecase.systemId, cloneUsecase(usecase));

  for (const edit of context.input.activeManualUsecaseEdits) {
    if (edit.usecase !== null)
      projected.set(edit.usecase.systemId, cloneUsecase(edit.usecase));
  }

  applyFinalizedTopologyChanges(context, projected);
  for (const classification of context.classifiedUcs)
    applyClassifiedUsecase(
      projected,
      classification,
      context.input.fileSystemId,
    );

  const usecases = [...projected.values()].sort(
    (left, right) => left.systemId - right.systemId,
  );
  const subgraphSystemIds = new Set<number>();
  const directedPairKeys = new Set<string>();
  const unorderedPairKeys = new Set<string>();
  for (const usecase of usecases) {
    for (const systemId of usecase.subgraphSystemIds)
      subgraphSystemIds.add(systemId);
    for (const pair of usecase.subgraphPairs) {
      directedPairKeys.add(
        directedProjectedPairKey(
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ),
      );
      unorderedPairKeys.add(
        unorderedProjectedPairKey(
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ),
      );
    }
  }
  return {
    usecases,
    subgraphSystemIds,
    directedPairKeys,
    unorderedPairKeys,
  };
}
