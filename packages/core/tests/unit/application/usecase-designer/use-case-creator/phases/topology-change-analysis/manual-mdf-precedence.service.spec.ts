/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {CHANGE_OPERATION} from '../../../../../../../src/application/shared/change-vocabulary.js';
import {ManualMdfPrecedenceService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/manual-mdf-precedence.service.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type MdfSubstitutionDecision,
  type UsecaseTopologyDecision,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import type {RoutingInput} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  subgraphPairs: readonly {
    sourceSubgraphSystemId: number;
    destSubgraphSystemId: number;
  }[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: subgraphPairs.map(pair => ({...pair})),
  });
}

function input(
  activeManualUsecaseEdits: RoutingInput['activeManualUsecaseEdits'],
): RoutingInput {
  return {activeManualUsecaseEdits} as RoutingInput;
}

function mdfDecision(currentUsecase: UseCase): MdfSubstitutionDecision {
  return {
    kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
    usecase: currentUsecase,
    substitutions: [
      {
        removedPair: {
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 20,
        },
        replacementSubgraphSystemIds: [30],
        replacementPairs: [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
          {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
        ],
      },
    ],
    structuralChange: {
      addedSubgraphSystemIds: [30],
      removedSubgraphSystemIds: [],
      addedPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
      removedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      resultingSubgraphSystemIds: [10, 20, 30],
      resultingPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
      resultingType: currentUsecase.type,
      sgkvAssignments: [],
    },
  };
}

describe('ManualMdfPrecedenceService', () => {
  const service = new ManualMdfPrecedenceService();
  const committed = usecase(
    100,
    [10, 20],
    [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
  );

  it.each(['AUTO', 'MANUAL'] as const)(
    'suppresses a duplicate MDF write for a valid unselected manual UPDATE in %s mode',
    mode => {
      const manualProjection = usecase(
        100,
        [10, 20, 30],
        [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
          {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
        ],
      );

      expect(
        service.apply(
          input([
            {
              changeId: 1,
              operation: CHANGE_OPERATION.Update,
              usecase: manualProjection,
              referencedComponents: null,
            },
          ]),
          [mdfDecision(committed)],
        ),
      ).toEqual([]);
      expect(mode).toBeDefined();
    },
  );

  it('preserves an ordinary decision for the same manually updated UC', () => {
    const ordinary = {
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: committed,
      deletedComponent: {type: 'DATA_LINK', systemId: 1},
      reconstructionPaths: [],
    } as UsecaseTopologyDecision;

    expect(
      service.apply(
        input([
          {
            changeId: 1,
            operation: CHANGE_OPERATION.Update,
            usecase: usecase(
              100,
              [10, 20, 30],
              [
                {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
                {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
              ],
            ),
            referencedComponents: null,
          },
        ]),
        [ordinary],
      ),
    ).toEqual([ordinary]);
  });

  it('never promotes a newly staged manual CREATE into committed topology decisions', () => {
    const ordinary = {
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: committed,
      deletedComponent: {type: 'DATA_LINK', systemId: 1},
      reconstructionPaths: [],
    } as UsecaseTopologyDecision;
    const stagedCreate = usecase(
      200,
      [10, 20, 30],
      [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
    );

    expect(
      service.apply(
        input([
          {
            changeId: 2,
            operation: CHANGE_OPERATION.Create,
            usecase: stagedCreate,
            referencedComponents: null,
          },
        ]),
        [ordinary],
      ),
    ).toEqual([ordinary]);
  });

  it('does not suppress MDF maintenance when manual topology lacks a replacement pair', () => {
    const incompleteProjection = usecase(
      100,
      [10, 20, 30],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 30}],
    );

    expect(
      service.apply(
        input([
          {
            changeId: 1,
            operation: CHANGE_OPERATION.Update,
            usecase: incompleteProjection,
            referencedComponents: null,
          },
        ]),
        [mdfDecision(committed)],
      ),
    ).toEqual([mdfDecision(committed)]);
  });
});
