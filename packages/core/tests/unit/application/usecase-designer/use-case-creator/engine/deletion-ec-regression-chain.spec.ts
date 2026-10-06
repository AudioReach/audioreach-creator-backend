/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {
  USECASE_CANDIDATE_KIND,
  type AutoUsecaseCandidate,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {
  committedUsecase,
  createMdfSubstitutionRoutingHarness,
  pair,
  subgraph,
  type PureMdfScenario,
  type PureMdfScenarioBody,
} from './helpers/mdf-substitution-routing-harness.js';

function candidate(
  members: readonly number[],
  valueSystemId: number,
): AutoUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
    path: {
      subgraphSystemIds: [...members],
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(
      members.map(systemId => [systemId, {keyValues: []}]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: valueSystemId}],
  };
}

function ordinaryDeletionScenario(input: {
  readonly selectedUsecaseSystemIds: readonly number[];
}): PureMdfScenario {
  const firstPair = pair(100, 10, 20);
  const deletedPair = pair(101, 20, 30);
  return {
    mode: 'AUTOMATIC',
    selectedUsecaseSystemIds: input.selectedUsecaseSystemIds,
    committedUsecases: [
      committedUsecase({
        systemId: 700,
        members: [10, 20, 30],
        pairs: [
          [10, 20],
          [20, 30],
        ],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [subgraph(10), subgraph(20), subgraph(30)],
    committedPairs: [firstPair, deletedPair],
    addedPairs: [],
    deletedPairs: [deletedPair],
  };
}

function sharedOrdinaryDeletionScenario(input: {
  readonly affectedUsecaseSystemIds: readonly number[];
  readonly selectedUsecaseSystemIds: readonly number[];
}): PureMdfScenario {
  const deletedPair = pair(100, 10, 20);
  return {
    mode: 'AUTOMATIC',
    selectedUsecaseSystemIds: input.selectedUsecaseSystemIds,
    committedUsecases: input.affectedUsecaseSystemIds.map(systemId =>
      committedUsecase({
        systemId,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100 + systemId]],
        type: 'LINKED',
      }),
    ),
    subgraphs: [subgraph(10), subgraph(20)],
    committedPairs: [deletedPair],
    addedPairs: [],
    deletedPairs: [deletedPair],
  };
}

function parallelSupportScenario(input: {
  readonly deletedDataLinkSystemId: number;
}): PureMdfScenario {
  const deletedPair = pair(input.deletedDataLinkSystemId, 10, 20);
  const survivingPair = pair(111, 10, 20);
  return {
    mode: 'AUTOMATIC',
    selectedUsecaseSystemIds: [],
    committedUsecases: [
      committedUsecase({
        systemId: 700,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [subgraph(10), subgraph(20)],
    committedPairs: [deletedPair, survivingPair],
    addedPairs: [],
    deletedPairs: [deletedPair],
  };
}

function ecConnectionDeletedScenario(): PureMdfScenarioBody {
  const leftPair = pair(100, 10, 20);
  const ecConnector = pair(101, 20, 30, DATA_LINK_TYPE.Ec);
  const rightPair = pair(102, 30, 40);
  return {
    committedUsecases: [
      committedUsecase({
        systemId: 700,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
      committedUsecase({
        systemId: 701,
        members: [20, 30],
        pairs: [[20, 30]],
        gkv: [[1, 200]],
        type: 'EC',
      }),
      committedUsecase({
        systemId: 702,
        members: [30, 40],
        pairs: [[30, 40]],
        gkv: [[1, 300]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [
      subgraph(10),
      subgraph(20),
      subgraph(25),
      subgraph(30),
      subgraph(35),
      subgraph(40),
    ],
    committedPairs: [leftPair, ecConnector, rightPair],
    addedPairs: [
      pair(103, 10, 25),
      pair(104, 25, 20),
      pair(105, 30, 35),
      pair(106, 35, 40),
    ],
    deletedPairs: [ecConnector],
    dfsCandidates: [candidate([10, 25, 20], 100), candidate([30, 35, 40], 300)],
  };
}

function ecBridgeAndTailDeletedScenario(): PureMdfScenarioBody {
  return {
    committedUsecases: [
      committedUsecase({
        systemId: 700,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
      committedUsecase({
        systemId: 701,
        members: [20, 30],
        pairs: [[20, 30]],
        gkv: [[1, 200]],
        type: 'EC',
      }),
      committedUsecase({
        systemId: 702,
        members: [40, 50],
        pairs: [[40, 50]],
        gkv: [[1, 300]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [
      subgraph(10),
      subgraph(20),
      subgraph(25),
      subgraph(30),
      subgraph(40),
      subgraph(45),
      subgraph(50),
    ],
    committedPairs: [
      pair(100, 10, 20),
      pair(101, 20, 30, DATA_LINK_TYPE.Ec),
      pair(107, 30, 40, DATA_LINK_TYPE.Ec),
      pair(108, 40, 50),
    ],
    addedPairs: [
      pair(103, 10, 25),
      pair(104, 25, 20),
      pair(109, 40, 45),
      pair(110, 45, 50),
    ],
    deletedSubgraphSystemIds: [30],
    deletedPairs: [
      pair(101, 20, 30, DATA_LINK_TYPE.Ec),
      pair(107, 30, 40, DATA_LINK_TYPE.Ec),
    ],
    dfsCandidates: [candidate([10, 25, 20], 100), candidate([40, 45, 50], 300)],
  };
}

function ecRightDomainMdfScenario(): PureMdfScenario {
  const oldPair = pair(200, 50, 60, DATA_LINK_TYPE.Ec);
  return {
    mode: 'AUTOMATIC',
    selectedUsecaseSystemIds: [],
    committedUsecases: [
      committedUsecase({
        systemId: 702,
        members: [50, 60],
        pairs: [[50, 60]],
        gkv: [[1, 700]],
        type: 'EC',
      }),
    ],
    subgraphs: [subgraph(50), subgraph(55, {isMdf: true}), subgraph(60)],
    committedPairs: [oldPair],
    addedPairs: [
      pair(201, 50, 55, DATA_LINK_TYPE.Ec),
      pair(202, 55, 60, DATA_LINK_TYPE.Ec),
    ],
    deletedPairs: [oldPair],
  };
}

function descriptorIds(
  descriptors: ReadonlyArray<{
    usecaseSystemId: number;
    kind: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNCHANGED';
  }>,
  kind: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNCHANGED',
): number[] {
  return descriptors
    .filter(descriptor => descriptor.kind === kind)
    .map(descriptor => descriptor.usecaseSystemId)
    .sort((left, right) => left - right);
}

describe('legacy deletion and EC routing regression chain', () => {
  it('T1-014 keeps ordinary selected deletion on reconstruction', async () => {
    const harness = createMdfSubstitutionRoutingHarness(
      ordinaryDeletionScenario({selectedUsecaseSystemIds: [700]}),
    );

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.observed.topologyDecisionKinds).toEqual([
      'DELETE_OR_RECONSTRUCT',
    ]);
    expect(harness.observed.topologyDecisionKinds).not.toContain(
      'MDF_SUBSTITUTION',
    );
  });

  it('T1-022/T2-060 retains the full FR-DEL-02 affected set', async () => {
    const harness = createMdfSubstitutionRoutingHarness(
      sharedOrdinaryDeletionScenario({
        affectedUsecaseSystemIds: [700, 701, 702],
        selectedUsecaseSystemIds: [],
      }),
    );

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(result.issues[0]).toEqual(
        expect.objectContaining({
          code: 'ARC-ROUTING-DEL-02',
          impactedUsecases: [700, 701, 702],
        }),
      );
    }
  });

  it('T2-067 keeps the UC when one parallel support path survives', async () => {
    const harness = createMdfSubstitutionRoutingHarness(
      parallelSupportScenario({deletedDataLinkSystemId: 110}),
    );

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.descriptors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({usecaseSystemId: 700, kind: 'DELETE'}),
      ]),
    );
    expect(harness.observed.topologyDecisionKinds).not.toContain(
      'MDF_SUBSTITUTION',
    );
  });

  it.each([
    {
      legacyId: 'T2-041',
      scenario: ecConnectionDeletedScenario(),
    },
    {
      legacyId: 'T2-044',
      scenario: ecBridgeAndTailDeletedScenario(),
    },
  ])('$legacyId preserves legacy EC deletion ownership', async ({scenario}) => {
    const harness = createMdfSubstitutionRoutingHarness({
      ...scenario,
      mode: 'AUTOMATIC',
      selectedUsecaseSystemIds: [701],
    });

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(descriptorIds(harness.writes.descriptors, 'DELETE')).toEqual([701]);
    expect(descriptorIds(harness.writes.descriptors, 'UPDATE')).toEqual([
      700, 702,
    ]);
  });

  it('T2-065 preserves one EC crossing when its right domain receives an MDF chain', async () => {
    const harness = createMdfSubstitutionRoutingHarness(
      ecRightDomainMdfScenario(),
    );

    const result = await harness.run();

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(harness.writes.deltas).toEqual([
      expect.objectContaining({
        usecaseSystemId: 702,
        descriptorKind: 'UPDATE',
        removedPairs: [[50, 60]],
        addedMembers: [55],
        addedPairs: [
          [50, 55],
          [55, 60],
        ],
        usecaseType: 'EC',
      }),
    ]);
    expect(harness.writes.descriptors).toHaveLength(1);
    expect(
      harness.observed.classificationTopologies.filter(
        topology => topology.type === 'EC',
      ),
    ).toHaveLength(1);
  });
});
