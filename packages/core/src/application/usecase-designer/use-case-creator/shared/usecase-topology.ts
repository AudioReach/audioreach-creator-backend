/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Provides canonical UseCase and candidate topology comparison rules.
 *
 * Used by `ClassificationPhase` and `SameGkvCollisionService`.
 */
import type {
  UseCase,
  SubgraphPair,
} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {
  SgkvInstance,
  UsecaseCandidate,
} from '../contracts/routing-state.js';
import {USECASE_CANDIDATE_KIND} from '../contracts/routing-state.js';

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

/**
 * Builds an in-memory key for a directed subgraph relationship.
 * The source and destination remain ordered, so reversing them produces a
 * different key.
 */
export function directedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}>${destSubgraphSystemId}`;
}

/**
 * Builds an in-memory key for an unordered subgraph relationship.
 * The endpoint IDs are normalized to ascending order, so either direction
 * produces the same key.
 */
export function unorderedPairKey(
  firstSubgraphSystemId: number,
  secondSubgraphSystemId: number,
): string {
  return firstSubgraphSystemId < secondSubgraphSystemId
    ? `${firstSubgraphSystemId}>${secondSubgraphSystemId}`
    : `${secondSubgraphSystemId}>${firstSubgraphSystemId}`;
}

/** Builds a directed key by extracting the ordered endpoints from a pair. */
export function directedPairKeyOf(pair: SubgraphPair): string {
  return directedPairKey(
    pair.sourceSubgraphSystemId,
    pair.destSubgraphSystemId,
  );
}

/** Builds an unordered key by extracting the endpoints from a pair. */
export function unorderedPairKeyOf(pair: SubgraphPair): string {
  return unorderedPairKey(
    pair.sourceSubgraphSystemId,
    pair.destSubgraphSystemId,
  );
}

export function gkvValueIdKey(gkv: readonly KvPair[]): string {
  return canonicalNumericSetKey(gkv.map(pair => pair.valueDefSystemId));
}

export function candidateSubgraphSystemIds(
  candidate: UsecaseCandidate,
): readonly number[] {
  return candidate.kind === USECASE_CANDIDATE_KIND.Manual
    ? candidate.memberSubgraphSystemIds
    : candidate.path.subgraphSystemIds;
}

/**
 * Pairs backed by data links. These are the routing topology: DFS, cycle
 * detection, route endpoints, UseCase type, MDF analysis, and EC bridge
 * suppression all read this and never the union.
 */
export function candidateDataLinkPairs(
  candidate: UsecaseCandidate,
): readonly SubgraphPair[] {
  if (candidate.kind === USECASE_CANDIDATE_KIND.Manual) {
    return candidate.topology.pairs
      .filter(item => item.dataLinks.length > 0)
      .map(item => item.pair);
  }

  // Routed candidates store a path of vertices; persisted UseCases store its edges.
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

/**
 * Every pair the candidate would persist: data-link pairs plus the control-link
 * pairs no data-link pair already covers. Consumers that compare against or
 * write `UseCase.subgraphPairs` read this, because that column is the union.
 */
export function candidatePairs(
  candidate: UsecaseCandidate,
): readonly SubgraphPair[] {
  const dataLinkPairs = candidateDataLinkPairs(candidate);
  const covered = new Set(dataLinkPairs.map(pair => unorderedPairKeyOf(pair)));
  const additions: SubgraphPair[] = [];
  for (const pair of candidate.controlLinkPairs) {
    const key = unorderedPairKeyOf(pair);
    if (covered.has(key)) continue;
    covered.add(key);
    additions.push(pair);
  }
  return additions.length === 0
    ? dataLinkPairs
    : [...dataLinkPairs, ...additions];
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
  candidate: UsecaseCandidate,
  existingUsecase: UseCase,
): boolean {
  // Exact reuse requires the same GKV, subgraph set, and directed edges.
  return (
    canonicalNumericSetKey(candidateSubgraphSystemIds(candidate)) ===
      canonicalNumericSetKey(existingUsecase.subgraphSystemIds) &&
    sameDirectedPairs(
      candidatePairs(candidate),
      existingUsecase.subgraphPairs,
    ) &&
    gkvValueIdKey(candidate.gkv) ===
      canonicalNumericSetKey(existingUsecase.keyVector.valueSystemIds)
  );
}

export function addedInteriorSubgraphIds(
  candidate: UsecaseCandidate,
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

  const candidateTopologyPairs = candidatePairs(candidate);
  const candidateEnds = deriveStartEndSets(candidateTopologyPairs);
  const existingEnds = deriveStartEndSets(existingUsecase.subgraphPairs);
  if (
    !sameSet(candidateEnds.startSystemIds, existingEnds.startSystemIds) ||
    !sameSet(candidateEnds.endSystemIds, existingEnds.endSystemIds)
  ) {
    return [];
  }

  const existingIds = new Set(existingUsecase.subgraphSystemIds);
  const candidateIds = new Set(candidateSubgraphSystemIds(candidate));
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
