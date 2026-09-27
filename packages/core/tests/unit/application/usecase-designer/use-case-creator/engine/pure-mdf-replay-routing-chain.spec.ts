/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import type {RoutingCombination} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {
  createMdfSubstitutionRoutingHarness,
  multiHopScenario,
  singleHopScenario,
} from './helpers/mdf-substitution-routing-harness.js';

function candidateWithCollision(
  members: readonly number[],
): RoutingCombination {
  return {
    path: {
      subgraphSystemIds: [...members],
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(
      members.map(systemId => [systemId, {keyValues: []}]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

describe('pure MDF replay routing chain', () => {
  it('uses the MDF structural change during collision replay without staging it', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      dfsCandidates: [candidateWithCollision([10, 40, 20])],
    });

    const firstResult = await harness.run();

    expect(firstResult.kind).toBe(RESULT_KIND.Fail);
    const [generatedCollisionId] = harness.observed.collisionIds;
    expect(generatedCollisionId).toEqual(expect.any(String));
    expect(generatedCollisionId).not.toHaveLength(0);

    harness.clearRecordedWrites();
    const result = await harness.resolveCollision(generatedCollisionId!);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok)
      throw new Error('Expected replay to succeed');
    expect(result.data.collisionId).toBe(generatedCollisionId);
    expect(harness.observed.collisionIds).toEqual([
      generatedCollisionId,
      generatedCollisionId,
    ]);
    expect(harness.observed.classificationTopologies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usecaseSystemId: 700,
          members: [10, 20, 30],
          pairs: [
            [10, 30],
            [30, 20],
          ],
        }),
      ]),
    );
    expect(harness.observed.phaseOrder).toEqual([
      'PRE_VALIDATION',
      'TOPOLOGY_CHANGE_ANALYSIS',
      'ISLAND_TRANSITION',
      'KV_RESOLUTION',
      'SEED_DETECTION',
      'CONE_COMPUTATION',
      'DFS_ROUTING',
      'COMBINATION_EXPANSION',
      'CLASSIFICATION',
      'PRE_VALIDATION',
      'TOPOLOGY_CHANGE_ANALYSIS',
      'ISLAND_TRANSITION',
      'KV_RESOLUTION',
      'SEED_DETECTION',
      'CONE_COMPUTATION',
      'DFS_ROUTING',
      'COMBINATION_EXPANSION',
      'CLASSIFICATION',
    ]);
    expect(harness.writes.deltas).toEqual([]);
    expect(harness.writes.descriptors).toEqual([]);
  });

  it('fails an unknown collision ID without staging writes', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      dfsCandidates: [candidateWithCollision([10, 40, 20])],
    });

    const firstResult = await harness.run();

    expect(firstResult.kind).toBe(RESULT_KIND.Fail);
    const result = await harness.resolveCollision(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(harness.writes.deltas).toEqual([]);
    expect(harness.writes.descriptors).toEqual([]);
  });

  it('produces the same normalized delta on repeat and does not mutate routing input', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...multiHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
    });

    const first = await harness.run();
    const firstDeltas = structuredClone(harness.writes.deltas);
    harness.clearRecordedWrites();
    const second = await harness.run();

    expect(first.kind).toBe(RESULT_KIND.Ok);
    expect(second.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toEqual(firstDeltas);
    expect(harness.observed.inputAfterRun).toBe(
      harness.observed.inputBeforeRun,
    );
  });

  it('does not stage an MDF delta when a later pre-staging phase fails', async () => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...singleHopScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      failClassification: true,
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(harness.observed.topologyDecisionKinds).toEqual([
      'MDF_SUBSTITUTION',
    ]);
    expect(harness.observed.phaseOrder).not.toContain('ROUTING_CHANGE_STAGER');
    expect(harness.writes.deltas).toEqual([]);
    expect(harness.writes.descriptors).toEqual([]);
  });
});
