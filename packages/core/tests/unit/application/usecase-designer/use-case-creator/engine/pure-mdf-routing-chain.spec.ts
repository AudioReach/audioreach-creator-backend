/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  committedUsecase,
  createMdfSubstitutionRoutingHarness,
  multiHopScenario,
  pair,
  singleHopScenario,
  subgraph,
} from './helpers/mdf-substitution-routing-harness.js';

describe('pure MDF routing chain', () => {
  it('rewrites one committed UC through one MDF SG without selection or DFS output', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      dfsCandidates: [],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toEqual([
      expect.objectContaining({
        usecaseSystemId: 700,
        removedPairs: [[10, 20]],
        addedMembers: [30],
        addedPairs: [
          [10, 30],
          [30, 20],
        ],
        emptyMdfAssignments: [30],
        gkv: [[1, 100]],
        usecaseType: 'LINKED',
      }),
    ]);
    expect(harness.observed.topologyDecisionKinds).toEqual([
      'MDF_SUBSTITUTION',
    ]);
    expect(harness.writes.descriptors).toEqual([
      {usecaseSystemId: 700, kind: 'UPDATE'},
    ]);
  });

  it('folds every hop of a multi-MDF chain into one identity-preserving update', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...multiHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      dfsCandidates: [],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toEqual([
      expect.objectContaining({
        usecaseSystemId: 700,
        removedPairs: [[10, 20]],
        addedMembers: [30, 40],
        addedPairs: [
          [10, 30],
          [30, 40],
          [40, 20],
        ],
        emptyMdfAssignments: [30, 40],
        gkv: [[1, 100]],
        usecaseType: 'LINKED',
      }),
    ]);
    expect(harness.observed.topologyDecisionKinds).toEqual([
      'MDF_SUBSTITUTION',
    ]);
    expect(harness.writes.descriptors).toEqual([
      {usecaseSystemId: 700, kind: 'UPDATE'},
    ]);
  });

  it('exposes the fixture helpers as direct production-contract adapters', () => {
    const created = committedUsecase({
      systemId: 700,
      members: [10, 20],
      pairs: [[10, 20]],
      gkv: [[1, 100]],
      type: 'LINKED',
    });
    expect(created).toEqual(
      expect.objectContaining({systemId: 700, members: [10, 20]}),
    );
    expect(pair(1, 10, 20)).toEqual(
      expect.objectContaining({
        systemId: 1,
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 20,
      }),
    );
    expect(subgraph(30, {isMdf: true}).isMdf).toBe(true);
  });
});
