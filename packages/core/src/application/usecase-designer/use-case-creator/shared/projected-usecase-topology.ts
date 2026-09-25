/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {
  ClassifiedUsecase,
  InteriorExtensionClassification,
  RoutingCombination,
} from '../contracts/routing-state.js';

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
  subgraphSystemIds = usecase.subgraphSystemIds,
  subgraphPairs = usecase.subgraphPairs,
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
    type: usecase.type,
    orderedKeys: usecase.orderedKeys?.map(key => ({...key})),
  });
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

function applyPhaseTwoAndThree(
  context: RoutingContext,
  projected: Map<number, UseCase>,
): void {
  const deletion = context.deletionAnalysis;
  for (const marked of deletion?.markedForDeletion ?? [])
    projected.delete(marked.usecase.systemId);

  for (const preserved of deletion?.preservedUsecases ?? []) {
    const current = projected.get(preserved.usecase.systemId);
    if (!current) continue;
    const dropped = new Set(preserved.droppedSubgraphSystemIds);
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

  for (const transition of context.islandTransitions) {
    const current = projected.get(transition.usecase.systemId);
    if (!current) continue;
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
}

export function buildProjectedUsecaseTopology(
  context: RoutingContext,
): ProjectedUsecaseTopology {
  const projected = new Map<number, UseCase>();
  for (const usecase of context.input.graphSnapshot.committedUsecases)
    projected.set(usecase.systemId, cloneUsecase(usecase));

  if (context.input.mode === 'AUTO') {
    for (const edit of context.input.activeManualUsecaseEdits) {
      if (edit.usecase !== null)
        projected.set(edit.usecase.systemId, cloneUsecase(edit.usecase));
    }
  }

  applyPhaseTwoAndThree(context, projected);
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
