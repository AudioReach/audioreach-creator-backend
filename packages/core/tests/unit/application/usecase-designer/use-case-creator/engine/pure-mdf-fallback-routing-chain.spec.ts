/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  committedUsecase,
  createMdfSubstitutionRoutingHarness,
  mixedImpactScenario,
  singleHopScenario,
} from './helpers/mdf-substitution-routing-harness.js';

describe('pure MDF fallback routing chain', () => {
  it('falls back for the whole UC when one impacted pair is not a pure MDF substitution', async () => {
    const scenario = mixedImpactScenario({
      usecaseSystemId: 700,
      pureMdfReplacement: {oldPair: [10, 20], chain: [10, 30, 20]},
      ordinaryDeletion: [20, 50],
    });
    const unselected = createMdfSubstitutionRoutingHarness({
      ...scenario,
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
    });

    const failed = await unselected.run();

    expect(failed.kind).toBe(RESULT_KIND.Fail);
    if (failed.kind === RESULT_KIND.Fail)
      expect(failed.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ARC-ROUTING-DEL-02',
            impactedUsecases: [700],
          }),
        ]),
      );
    expect(unselected.writes.deltas).toEqual([]);

    const selected = createMdfSubstitutionRoutingHarness({
      ...scenario,
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [700],
    });
    const succeeded = await selected.run();

    expect(succeeded.kind).toBe(RESULT_KIND.Ok);
    expect(selected.observed.topologyDecisionKinds).toEqual([
      'DELETE_OR_RECONSTRUCT',
    ]);
    expect(selected.writes.deltas).toEqual([]);
    expect(selected.writes.descriptors).toEqual([
      {usecaseSystemId: 700, kind: 'DELETE'},
    ]);
  });

  it('analyzes committed UCs only and does not manufacture a decision for a newly staged UC', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [700, 701],
      newlyStagedUsecases: [
        committedUsecase({
          systemId: 701,
          members: [10, 20],
          pairs: [[10, 20]],
          gkv: [[2, 200]],
          type: 'LINKED',
        }),
      ],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.descriptors).toEqual([
      {usecaseSystemId: 700, kind: 'UPDATE'},
    ]);
  });

  it('uses the shared snapshot without graph or UC repository reads in Phase 2', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
    });

    await harness.run();

    expect(harness.writes.repositoryReadCounts).toEqual({
      graph: 0,
      usecase: 0,
      legacyEcSgkv: 0,
    });
  });
});
