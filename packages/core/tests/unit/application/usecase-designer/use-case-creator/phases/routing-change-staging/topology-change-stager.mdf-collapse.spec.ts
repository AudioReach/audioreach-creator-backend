/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {expect, it, jest} from '@jest/globals';
import {SOURCE} from '../../../../../../../src/application/shared/change-vocabulary.js';
import type {StagingState} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/topology-change-stager.js';
import {TopologyChangeStager} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/topology-change-stager.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

it('passes removed subgraph IDs to persistence for an MDF_TO_DIRECT decision', async () => {
  const applyStructuralChange = jest
    .fn()
    .mockResolvedValue({systemId: 500, changeId: 900});
  const staging: StagingState = {
    repository: {applyStructuralChange, delete: jest.fn()} as never,
    options: {source: SOURCE.AutoRouting},
    descriptors: new Map(),
  };
  const committed = new UseCase({
    systemId: 500,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [10, 30, 20],
    subgraphPairs: [
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
      {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
    ],
    type: 'LINKED',
  });

  await new TopologyChangeStager().stage({
    analysis: {
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: 'MDF_NORMALIZATION',
          usecase: committed,
          rewrites: [],
          structuralChange: {
            addedSubgraphSystemIds: [],
            removedSubgraphSystemIds: [30],
            addedPairs: [
              {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            ],
            removedPairs: [
              {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
              {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
            ],
            resultingSubgraphSystemIds: [10, 20],
            resultingPairs: [
              {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            ],
            resultingType: 'LINKED',
            sgkvAssignments: [],
          },
        },
      ],
    } as never,
    islandTransitions: [],
    staging,
  });

  expect(applyStructuralChange).toHaveBeenCalledWith(
    500,
    expect.objectContaining({
      removedSgSystemIds: [30],
      removedPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
      addedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    }),
    {source: SOURCE.AutoRouting},
    undefined,
    [],
  );
});
