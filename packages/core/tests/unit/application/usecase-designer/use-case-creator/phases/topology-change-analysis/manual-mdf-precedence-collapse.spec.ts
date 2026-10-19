/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION} from '../../../../../../../src/application/shared/change-vocabulary.js';
import type {RoutingInput} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  MDF_TOPOLOGY_REWRITE_KIND,
  USECASE_TOPOLOGY_DECISION_KIND,
  type MdfNormalizationDecision,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ManualMdfPrecedenceService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/manual-mdf-precedence.service.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  pairs: ReadonlyArray<readonly [number, number]>,
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: pairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    type: 'LINKED',
  });
}

function collapseDecision(committed: UseCase): MdfNormalizationDecision {
  return {
    kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
    usecase: committed,
    rewrites: [
      {
        kind: MDF_TOPOLOGY_REWRITE_KIND.MdfToDirect,
        directPair: {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        mdfSubgraphSystemIds: [30],
        committedPairs: [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
          {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
        ],
        normalizedPairs: [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        ],
      },
    ],
    structuralChange: {
      addedSubgraphSystemIds: [],
      removedSubgraphSystemIds: [30],
      addedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      removedPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
      resultingSubgraphSystemIds: [10, 20],
      resultingPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      resultingType: 'LINKED',
      sgkvAssignments: [],
    },
  };
}

function input(manualUsecase: UseCase): RoutingInput {
  return {
    activeManualUsecaseEdits: [
      {
        operation: CHANGE_OPERATION.Update,
        usecase: manualUsecase,
        changeId: 1,
        referencedComponents: null,
      },
    ],
  } as RoutingInput;
}

describe('ManualMdfPrecedenceService MDF collapse', () => {
  const service = new ManualMdfPrecedenceService();
  const committed = usecase(
    100,
    [10, 30, 20],
    [
      [10, 30],
      [30, 20],
    ],
  );

  it('suppresses automatic collapse when the manual projection matches', () => {
    const manual = usecase(100, [10, 20], [[10, 20]]);

    expect(service.apply(input(manual), [collapseDecision(committed)])).toEqual(
      [],
    );
  });

  it('does not suppress when the manual projection keeps a committed pair', () => {
    const manual = usecase(
      100,
      [10, 30, 20],
      [
        [10, 30],
        [30, 20],
      ],
    );

    expect(
      service.apply(input(manual), [collapseDecision(committed)]),
    ).toHaveLength(1);
  });

  it('does not suppress when the manual projection retains the deleted MDF member', () => {
    const manual = usecase(100, [10, 30, 20], [[10, 20]]);

    expect(
      service.apply(input(manual), [collapseDecision(committed)]),
    ).toHaveLength(1);
  });
});
