/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {KvPair} from '../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import type {
  AutoUsecaseCandidate,
  ManualUsecaseCandidate,
  SgkvInstance,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {
  PATH_TERMINATION,
  USECASE_CANDIDATE_KIND,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import type {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  addedInteriorSubgraphIds,
  candidateDataLinkPairs,
  candidatePairs,
  canonicalNumericSetKey,
  deriveStartEndSets,
  directedPairKey,
  directedPairKeyOf,
  exactTopologyEquals,
  gkvValueIdKey,
  hasEmptyAssignment,
  unorderedPairKey,
  unorderedPairKeyOf,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/usecase-topology.js';

function candidate(
  subgraphSystemIds: number[],
  valueSystemIds: number[],
  assignments: Record<number, KvPair[]> = {},
): AutoUsecaseCandidate {
  const sgkvAssignment = new Map<number, SgkvInstance>(
    subgraphSystemIds.map(systemId => [
      systemId,
      {keyValues: assignments[systemId] ?? []},
    ]),
  );
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
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
    controlLinkPairs: [],
  };
}

function manualCandidate(
  subgraphSystemIds: number[],
  subgraphPairs: Array<[number, number]>,
  valueSystemIds: number[],
): ManualUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Manual,
    memberSubgraphSystemIds: subgraphSystemIds,
    topology: {
      pairs: subgraphPairs.map(
        ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
          pair: {sourceSubgraphSystemId, destSubgraphSystemId},
          dataLinks: [{systemId: 1}] as never,
          controlLinks: [],
        }),
      ),
    },
    sgkvAssignment: new Map(
      subgraphSystemIds.map(systemId => [systemId, {keyValues: []}]),
    ),
    gkv: valueSystemIds.map(valueSystemId => ({
      keyDefSystemId: valueSystemId + 1000,
      valueDefSystemId: valueSystemId,
    })),
    controlLinkPairs: [],
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
    expect(unorderedPairKey(30, 10)).toBe('10>30');
    expect(
      directedPairKeyOf({sourceSubgraphSystemId: 10, destSubgraphSystemId: 30}),
    ).toBe('10>30');
    expect(
      unorderedPairKeyOf({
        sourceSubgraphSystemId: 30,
        destSubgraphSystemId: 10,
      }),
    ).toBe('10>30');
  });

  it('derives starts and ends', () => {
    const pairs = [
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ];

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

  it('compares an explicit directed pair set independently of order and direction', () => {
    const existing = existingUsecase([20, 10], [[20, 10]], [100]);

    expect(
      exactTopologyEquals(
        manualCandidate([10, 20], [[20, 10]], [100]),
        existing,
      ),
    ).toBe(true);
    expect(
      exactTopologyEquals(
        manualCandidate([10, 20], [[10, 20]], [100]),
        existing,
      ),
    ).toBe(false);
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

describe('candidateDataLinkPairs', () => {
  it('converts a routed path into adjacent directed edges', () => {
    const result = candidateDataLinkPairs({
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [10, 20, 30],
        termination: PATH_TERMINATION.NaturalLeaf,
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map(),
      gkv: [],
      controlLinkPairs: [
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
      ],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
  });

  it('returns only data-supported pairs for a manual candidate', () => {
    const dataPair = {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20};
    const controlPair = {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40};

    const result = candidateDataLinkPairs({
      kind: USECASE_CANDIDATE_KIND.Manual,
      memberSubgraphSystemIds: [10, 20, 40],
      topology: {
        pairs: [
          {
            pair: dataPair,
            dataLinks: [{systemId: 1}] as never,
            controlLinks: [],
          },
          {
            pair: controlPair,
            dataLinks: [],
            controlLinks: [{systemId: 2}] as never,
          },
        ],
      },
      sgkvAssignment: new Map(),
      gkv: [],
      controlLinkPairs: [controlPair],
    });

    expect(result).toEqual([dataPair]);
  });
});

describe('candidatePairs', () => {
  it('appends control-link pairs that no data-link pair already covers', () => {
    const result = candidatePairs({
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [10, 20, 30, 40],
        termination: PATH_TERMINATION.NaturalLeaf,
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map(),
      gkv: [],
      controlLinkPairs: [
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
      {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
    ]);
  });

  it('drops a control-link pair whose endpoints a data-link pair already covers in reverse', () => {
    const result = candidatePairs({
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [40, 20],
        termination: PATH_TERMINATION.NaturalLeaf,
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map(),
      gkv: [],
      controlLinkPairs: [
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 40, destSubgraphSystemId: 20},
    ]);
  });
});

describe('exactTopologyEquals with control-link pairs', () => {
  it('matches when the stored UseCase already holds the control-link pair', () => {
    const candidateCombination = {
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [10, 20, 30, 40],
        termination: PATH_TERMINATION.NaturalLeaf,
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map(),
      gkv: [{keyDefSystemId: 1, valueDefSystemId: 99}],
      controlLinkPairs: [
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
    };

    const existing = existingUsecase(
      [10, 20, 30, 40],
      [
        [10, 20],
        [20, 30],
        [30, 40],
        [20, 40],
      ],
      [99],
    );

    expect(exactTopologyEquals(candidateCombination, existing)).toBe(true);
  });

  it('does not match when the stored UseCase lacks the control-link pair', () => {
    const candidateCombination = {
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [10, 20, 30, 40],
        termination: PATH_TERMINATION.NaturalLeaf,
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map(),
      gkv: [{keyDefSystemId: 1, valueDefSystemId: 99}],
      controlLinkPairs: [
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
    };

    const existing = existingUsecase(
      [10, 20, 30, 40],
      [
        [10, 20],
        [20, 30],
        [30, 40],
      ],
      [99],
    );

    expect(exactTopologyEquals(candidateCombination, existing)).toBe(false);
  });
});
