/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  committedUsecase,
  createMdfSubstitutionRoutingHarness,
  mixedImpactScenario,
  pair,
  singleHopScenario,
  subgraph,
} from './helpers/mdf-substitution-routing-harness.js';

function activeManualUpdate(input: {
  readonly changeId: number;
  readonly usecaseSystemId: number;
  readonly members: readonly number[];
  readonly pairs: readonly (readonly [number, number])[];
  readonly referencedDataLinkSystemIds: readonly number[];
}): ActiveManualUsecaseEdit {
  return {
    changeId: input.changeId,
    operation: CHANGE_OPERATION.Update,
    usecase: new UseCase({
      systemId: input.usecaseSystemId,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [100]},
      subgraphSystemIds: [...input.members],
      subgraphPairs: input.pairs.map(
        ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
          sourceSubgraphSystemId,
          destSubgraphSystemId,
        }),
      ),
      type: 'LINKED' as never,
    }),
    referencedComponents: {
      sgSystemIds: [...input.members],
      dataLinkSystemIds: [...input.referencedDataLinkSystemIds],
      controlLinkSystemIds: [],
    },
  };
}

function validManualMdfUpdate(): ActiveManualUsecaseEdit {
  return activeManualUpdate({
    changeId: 41,
    usecaseSystemId: 700,
    members: [10, 30, 20],
    pairs: [
      [10, 30],
      [30, 20],
    ],
    referencedDataLinkSystemIds: [101, 102],
  });
}

function staleManualMdfUpdate(): ActiveManualUsecaseEdit {
  return activeManualUpdate({
    changeId: 41,
    usecaseSystemId: 700,
    members: [10, 20],
    pairs: [[10, 20]],
    referencedDataLinkSystemIds: [100],
  });
}

function twoIndependentSingleHopScenario() {
  const first = singleHopScenario({committedUsecaseSystemId: 700});
  const secondOldPair = pair(110, 50, 60);
  return {
    committedUsecases: [
      ...first.committedUsecases,
      committedUsecase({
        systemId: 701,
        members: [50, 60],
        pairs: [[50, 60]],
        gkv: [[2, 200]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [
      ...first.subgraphs,
      subgraph(50),
      subgraph(70, {isMdf: true}),
      subgraph(60),
    ],
    committedPairs: [...first.committedPairs, secondOldPair],
    deletedPairs: [...first.deletedPairs, secondOldPair],
    addedPairs: [...first.addedPairs, pair(111, 50, 70), pair(112, 70, 60)],
  };
}

describe('pure MDF manual precedence routing chain', () => {
  it.each(['AUTOMATIC', 'MANUAL'] as const)(
    '%s mode gives an active manual update precedence only for its UC',
    async mode => {
      const harness = createMdfSubstitutionRoutingHarness({
        ...twoIndependentSingleHopScenario(),
        mode,
        selectedUsecaseSystemIds: [],
        activeManualUsecaseEdits: [validManualMdfUpdate()],
      });

      const result = await harness.run();

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (mode === 'MANUAL') {
        expect(harness.writes.descriptors).toEqual([]);
        expect(harness.writes.deltas).toEqual([]);
      } else {
        expect(harness.writes.descriptors).toEqual([
          {usecaseSystemId: 701, kind: 'UPDATE'},
        ]);
        expect(harness.writes.descriptors).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({usecaseSystemId: 700}),
          ]),
        );
      }
    },
  );

  it.each(['AUTOMATIC', 'MANUAL'] as const)(
    '%s mode rejects a stale manual reference before publishing topology decisions',
    async mode => {
      const harness = createMdfSubstitutionRoutingHarness({
        ...singleHopScenario({committedUsecaseSystemId: 700}),
        mode,
        selectedUsecaseSystemIds: [],
        activeManualUsecaseEdits: [staleManualMdfUpdate()],
      });

      const result = await harness.run();

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind === RESULT_KIND.Fail)
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            code: 'ARC-ROUTING-MANUAL-UC-BROKEN-DEPS',
          }),
        );
      expect(harness.observed.phaseOrder).toEqual(['PRE_VALIDATION']);
      expect(harness.observed.topologyDecisionKinds).toEqual([]);
      expect(harness.writes.descriptors).toEqual([]);
      expect(harness.writes.deltas).toEqual([]);
    },
  );

  it.each(['AUTOMATIC', 'MANUAL'] as const)(
    '%s mode still applies FR-DEL-02 to an ordinary impact on the manually updated UC',
    async mode => {
      const harness = createMdfSubstitutionRoutingHarness({
        ...mixedImpactScenario({
          usecaseSystemId: 700,
          pureMdfReplacement: {oldPair: [10, 20], chain: [10, 30, 20]},
          ordinaryDeletion: [20, 50],
        }),
        mode,
        selectedUsecaseSystemIds: [],
        activeManualUsecaseEdits: [validManualMdfUpdate()],
      });

      const result = await harness.run();

      if (mode === 'MANUAL') {
        expect(result.kind).toBe(RESULT_KIND.Ok);
      } else {
        expect(result.kind).toBe(RESULT_KIND.Fail);
        if (result.kind === RESULT_KIND.Fail)
          expect(result.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({code: 'ARC-ROUTING-DEL-02'}),
            ]),
          );
      }
      expect(harness.writes.deltas).toEqual([]);
    },
  );
});
