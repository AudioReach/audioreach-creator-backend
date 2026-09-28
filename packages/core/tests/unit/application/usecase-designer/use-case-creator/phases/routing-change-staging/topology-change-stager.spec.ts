/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {
  CHANGE_OPERATION,
  SOURCE,
} from '../../../../../../../src/application/shared/change-vocabulary.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {TopologyChangeStager} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/topology-change-stager.js';
import type {StagingState} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/topology-change-stager.js';

function usecase(systemId: number): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [10, 20],
    subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    type: 'LINKED',
  });
}

describe('TopologyChangeStager', () => {
  it('stages MDF decisions before deletion and records aggregate descriptors', async () => {
    const applyStructuralChange = jest
      .fn()
      .mockResolvedValue({systemId: 301, changeId: 901});
    const deleteUsecase = jest
      .fn()
      .mockResolvedValue({systemId: 302, changeId: 902});
    const staging: StagingState = {
      repository: {applyStructuralChange, delete: deleteUsecase} as never,
      options: {source: SOURCE.AutoRouting},
      descriptors: new Map(),
    };

    const result = await new TopologyChangeStager().stage({
      analysis: {
        affectedUsecaseSystemIds: new Set([302]),
        decisions: [
          {
            kind: 'MDF_SUBSTITUTION',
            usecase: usecase(301),
            substitutions: [],
            structuralChange: {
              addedSubgraphSystemIds: [15],
              removedSubgraphSystemIds: [],
              addedPairs: [
                {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
                {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
              ],
              removedPairs: [
                {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
              ],
              resultingSubgraphSystemIds: [10, 15, 20],
              resultingPairs: [
                {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
                {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
              ],
              resultingType: 'LINKED',
              sgkvAssignments: [],
            },
          },
          {
            kind: 'DELETE_OR_RECONSTRUCT',
            usecase: usecase(302),
            deletedComponent: {type: 'SUBGRAPH', systemId: 10},
            reconstructionPaths: [],
          },
        ],
      } as never,
      islandTransitions: [],
      staging,
    });

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(applyStructuralChange.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUsecase.mock.invocationCallOrder[0],
    );
    expect(staging.descriptors.get(301)).toEqual({
      systemId: 301,
      changeId: 901,
      operation: CHANGE_OPERATION.Update,
      source: SOURCE.AutoRouting,
    });
    expect(staging.descriptors.get(302)).toEqual({
      systemId: 302,
      changeId: 902,
      operation: CHANGE_OPERATION.Delete,
      source: SOURCE.AutoRouting,
    });
  });
});
