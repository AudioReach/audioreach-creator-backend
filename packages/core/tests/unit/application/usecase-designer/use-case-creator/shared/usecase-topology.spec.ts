/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {KvPair} from '../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import type {
  RoutingCombination,
  SgkvInstance,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import type {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  addedInteriorSubgraphIds,
  candidateDirectedAdjacentPairs,
  canonicalNumericSetKey,
  deriveStartEndSets,
  directedPairKey,
  exactTopologyEquals,
  gkvValueIdKey,
  hasEmptyAssignment,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/usecase-topology.js';

function candidate(
  subgraphSystemIds: number[],
  valueSystemIds: number[],
  assignments: Record<number, KvPair[]> = {},
): RoutingCombination {
  const sgkvAssignment = new Map<number, SgkvInstance>(
    subgraphSystemIds.map(systemId => [
      systemId,
      {keyValues: assignments[systemId] ?? []},
    ]),
  );
  return {
    path: {
      subgraphSystemIds,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment,
    gkv: valueSystemIds.map(valueSystemId => ({
      keyDefSystemId: valueSystemId + 1000,
      valueDefSystemId: valueSystemId,
    })),
  };
}

function existingUsecase(
  subgraphSystemIds: number[],
  subgraphPairs: Array<[number, number]>,
  valueSystemIds: number[],
): UseCase {
  return {
    systemId: 1,
    subgraphSystemIds,
    subgraphPairs: subgraphPairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    keyVector: {valueSystemIds},
  } as UseCase;
}

describe('usecase topology helpers', () => {
  it('canonicalizes numeric sets, values, and directed pairs', () => {
    expect(canonicalNumericSetKey([30, 10, 30, 2])).toBe('2,10,30');
    expect(
      gkvValueIdKey([
        {keyDefSystemId: 1, valueDefSystemId: 30},
        {keyDefSystemId: 2, valueDefSystemId: 10},
      ]),
    ).toBe('10,30');
    expect(directedPairKey(10, 30)).toBe('10>30');
  });

  it('derives starts and ends and candidate adjacent directed pairs', () => {
    const pairs = candidateDirectedAdjacentPairs(candidate([10, 20, 30], []));

    expect(pairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
    expect(deriveStartEndSets(pairs)).toEqual({
      startSystemIds: new Set([10]),
      endSystemIds: new Set([30]),
    });
  });

  it('recognizes exact topology independent of source ordering', () => {
    const candidateCombination = candidate([10, 30], [200, 100]);
    const existing = existingUsecase([30, 10], [[10, 30]], [100, 200]);

    expect(exactTopologyEquals(candidateCombination, existing)).toBe(true);
  });

  it('finds only strict interior additions with empty assignments', () => {
    const combination = candidate([10, 20, 30], [100, 200], {20: []});
    const existing = existingUsecase([10, 30], [[10, 30]], [100, 200]);

    expect(addedInteriorSubgraphIds(combination, existing)).toEqual([20]);
    expect(hasEmptyAssignment(combination.sgkvAssignment.get(20)!)).toBe(true);
    expect(
      addedInteriorSubgraphIds(
        candidate([20, 10, 30], [100, 200], {20: []}),
        existing,
      ),
    ).toEqual([]);
    expect(
      addedInteriorSubgraphIds(
        candidate([10, 20, 30], [100, 200], {
          20: [{keyDefSystemId: 1, valueDefSystemId: 2}],
        }),
        existing,
      ),
    ).toEqual([]);
  });

  it('recognizes an interior extension when persisted membership order differs from the path', () => {
    const combination = candidate([10, 20, 30], [100], {20: []});
    const existing = existingUsecase([30, 10], [[10, 30]], [100]);

    expect(addedInteriorSubgraphIds(combination, existing)).toEqual([20]);
  });
});
