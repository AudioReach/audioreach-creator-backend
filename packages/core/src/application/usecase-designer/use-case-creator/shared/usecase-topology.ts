/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UseCase,
  SubgraphPair,
} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {
  RoutingCombination,
  SgkvInstance,
} from '../contracts/routing-state.js';

/**
 * Shared topology rules for comparing a routed candidate with a persisted
 * UseCase. Topology identity consists of its GKV values, subgraph membership,
 * and directed subgraph pairs; collection ordering and duplicate entries do
 * not affect identity, but pair direction does.
 */
export interface StartEndSets {
  readonly startSystemIds: ReadonlySet<number>;
  readonly endSystemIds: ReadonlySet<number>;
}

/** Canonical string representation of a numeric set, independent of input order. */
export function canonicalNumericSetKey(ids: Iterable<number>): string {
  return [...new Set(ids)].sort((left, right) => left - right).join(',');
}

/** Encodes a directional edge; reversing the IDs produces a different key. */
export function directedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}>${destSubgraphSystemId}`;
}

export function gkvValueIdKey(gkv: readonly KvPair[]): string {
  return canonicalNumericSetKey(gkv.map(pair => pair.valueDefSystemId));
}

export function candidateDirectedAdjacentPairs(
  candidate: RoutingCombination,
): readonly SubgraphPair[] {
  // Candidates store a path of vertices; persisted UseCases store its edges.
  const pairs: SubgraphPair[] = [];
  for (
    let index = 1;
    index < candidate.path.subgraphSystemIds.length;
    index += 1
  ) {
    pairs.push({
      sourceSubgraphSystemId: candidate.path.subgraphSystemIds[index - 1],
      destSubgraphSystemId: candidate.path.subgraphSystemIds[index],
    });
  }
  return pairs;
}

export function deriveStartEndSets(
  pairs: readonly SubgraphPair[],
): StartEndSets {
  const starts = new Set<number>();
  const ends = new Set<number>();
  const sources = new Set(pairs.map(pair => pair.sourceSubgraphSystemId));
  const destinations = new Set(pairs.map(pair => pair.destSubgraphSystemId));
  for (const source of sources) {
    if (!destinations.has(source)) starts.add(source);
  }
  for (const destination of destinations) {
    if (!sources.has(destination)) ends.add(destination);
  }
  return {startSystemIds: starts, endSystemIds: ends};
}

export function hasEmptyAssignment(assignment: SgkvInstance): boolean {
  return assignment.keyValues.length === 0;
}

function directedPairSet(pairs: readonly SubgraphPair[]): Set<string> {
  return new Set(
    pairs.map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
}

function sameSet(
  left: ReadonlySet<number>,
  right: ReadonlySet<number>,
): boolean {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function sameDirectedPairs(
  left: readonly SubgraphPair[],
  right: readonly SubgraphPair[],
): boolean {
  const leftKeys = directedPairSet(left);
  const rightKeys = directedPairSet(right);
  return (
    leftKeys.size === rightKeys.size &&
    [...leftKeys].every(pairKey => rightKeys.has(pairKey))
  );
}

export function exactTopologyEquals(
  candidate: RoutingCombination,
  existingUsecase: UseCase,
): boolean {
  // Exact reuse requires the same GKV, subgraph set, and directed edges.
  return (
    canonicalNumericSetKey(candidate.path.subgraphSystemIds) ===
      canonicalNumericSetKey(existingUsecase.subgraphSystemIds) &&
    sameDirectedPairs(
      candidateDirectedAdjacentPairs(candidate),
      existingUsecase.subgraphPairs,
    ) &&
    gkvValueIdKey(candidate.gkv) ===
      canonicalNumericSetKey(existingUsecase.keyVector.valueSystemIds)
  );
}

export function addedInteriorSubgraphIds(
  candidate: RoutingCombination,
  existingUsecase: UseCase,
): readonly number[] {
  /**
   * An interior extension preserves the existing GKV and path endpoints while
   * adding only subgraphs with no SGKV assignment. An empty result means the
   * candidate must be handled as a different topology.
   */
  if (
    gkvValueIdKey(candidate.gkv) !==
    canonicalNumericSetKey(existingUsecase.keyVector.valueSystemIds)
  ) {
    return [];
  }

  const candidatePairs = candidateDirectedAdjacentPairs(candidate);
  const candidateEnds = deriveStartEndSets(candidatePairs);
  const existingEnds = deriveStartEndSets(existingUsecase.subgraphPairs);
  if (
    !sameSet(candidateEnds.startSystemIds, existingEnds.startSystemIds) ||
    !sameSet(candidateEnds.endSystemIds, existingEnds.endSystemIds)
  ) {
    return [];
  }

  const existingIds = new Set(existingUsecase.subgraphSystemIds);
  const candidateIds = new Set(candidate.path.subgraphSystemIds);
  if (
    candidateIds.size <= existingIds.size ||
    [...existingIds].some(id => !candidateIds.has(id))
  ) {
    return [];
  }

  const addedIds = [...candidateIds].filter(id => !existingIds.has(id));
  if (
    addedIds.some(id => {
      const assignment = candidate.sgkvAssignment.get(id);
      return assignment === undefined || !hasEmptyAssignment(assignment);
    })
  ) {
    return [];
  }
  return [...new Set(addedIds)].sort((left, right) => left - right);
}
