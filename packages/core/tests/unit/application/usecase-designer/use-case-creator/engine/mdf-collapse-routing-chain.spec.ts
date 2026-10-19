/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
import {USECASE_TOPOLOGY_DECISION_KIND} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  createMdfCollapseRoutingHarness,
  singleHopCollapseScenario,
} from './helpers/mdf-collapse-routing-harness.js';

describe('MDF collapse routing chain', () => {
  it('stages one identity-preserving update for an eligible unselected UC', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toEqual([
      expect.objectContaining({
        usecaseSystemId: 700,
        removedMembers: [30],
        removedPairs: [
          [10, 30],
          [30, 20],
        ],
        addedPairs: [[10, 20]],
      }),
    ]);
    expect(harness.observed.topologyDecisionKinds).toEqual([
      USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
    ]);
    expect(harness.writes.descriptors).toEqual([
      {usecaseSystemId: 700, kind: 'UPDATE'},
    ]);
  });

  it('uses ordinary deletion handling when a non-MDF deletion also affects the UC', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: {
        ...singleHopCollapseScenario({committedUsecaseSystemId: 700}),
        extraDeletedNonMdfSgSystemId: 11,
      },
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [700],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.observed.topologyDecisionKinds).not.toContain(
      USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
    );
  });

  it('produces no collapse decision in manual routing mode', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
      mode: 'MANUAL',
      selectedUsecaseSystemIds: [],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.observed.topologyDecisionKinds).toHaveLength(0);
    expect(harness.writes.deltas).toHaveLength(0);
  });

  it('suppresses automatic collapse when an active manual projection matches', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      activeManualUsecaseEdits: [
        {
          operation: CHANGE_OPERATION.Update,
          usecase: new UseCase({
            systemId: 700,
            fileSystemId: 1,
            keyVector: {valueSystemIds: []},
            subgraphSystemIds: [10, 20],
            subgraphPairs: [
              {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            ],
            type: 'LINKED' as never,
          }),
          changeId: 1,
          referencedComponents: {
            sgSystemIds: [10, 20],
            dataLinkSystemIds: [501],
            controlLinkSystemIds: [],
          },
        },
      ],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toHaveLength(0);
  });

  it('fails Phase 1 when a manual UC references a session-deleted SG', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
      activeManualUsecaseEdits: [
        {
          operation: CHANGE_OPERATION.Update,
          usecase: new UseCase({
            systemId: 700,
            fileSystemId: 1,
            keyVector: {valueSystemIds: [100]},
            subgraphSystemIds: [10, 30, 20],
            subgraphPairs: [
              {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
              {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
            ],
            type: 'LINKED' as never,
          }),
          changeId: 1,
          referencedComponents: {
            sgSystemIds: [10, 30, 20],
            dataLinkSystemIds: [401, 402],
            controlLinkSystemIds: [],
          },
        },
      ],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('produces the same duplicate-free delta on repeated runs', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
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
  });

  it('does not retain a structural delta when its staging write fails', async () => {
    const harness = createMdfCollapseRoutingHarness({
      scenario: singleHopCollapseScenario({committedUsecaseSystemId: 700}),
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [],
    });
    harness.failNextWrite();

    await expect(harness.run()).rejects.toThrow(
      'Injected structural write failure',
    );
    expect(harness.writes.deltas).toHaveLength(0);
  });
});
