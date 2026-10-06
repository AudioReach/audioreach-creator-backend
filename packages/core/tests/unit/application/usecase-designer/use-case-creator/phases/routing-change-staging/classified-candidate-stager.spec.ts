/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../../src/application/shared/change-vocabulary.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {ClassifiedCandidateStager} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/classified-candidate-stager.js';
import type {StagingState} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/topology-change-stager.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {USECASE_CANDIDATE_KIND} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';

describe('ClassifiedCandidateStager', () => {
  it('creates candidates with canonical SGKV assignments and descriptors', async () => {
    const create = jest.fn().mockResolvedValue({systemId: 701, changeId: 901});
    const staging: StagingState = {
      repository: {create} as never,
      options: {source: SOURCE.AutoRouting},
      descriptors: new Map(),
    };
    const candidate = {
      kind: USECASE_CANDIDATE_KIND.Auto,
      path: {
        subgraphSystemIds: [10, 20],
        termination: 'NATURAL_LEAF',
        ecBoundaryLinkId: null,
      },
      sgkvAssignment: new Map([
        [10, {keyValues: [{keyDefSystemId: 1, valueDefSystemId: 101}]}],
        [20, {keyValues: []}],
      ]),
      gkv: [{keyDefSystemId: 1, valueDefSystemId: 101}],
    };

    const result = await new ClassifiedCandidateStager().stage({
      classifications: [{kind: 'CREATE', candidate} as never],
      staging,
      input: createAutoRoutingInput({
        fileSystemId: 1,
        selection: {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [],
          excludedSubgraphSystemIds: [],
          excludedDataLinkSystemIds: [],
          excludedControlLinkSystemIds: [],
        },
        selectedUsecases: [],
        activeManualUsecaseEdits: [],
        graphSnapshot: {
          subgraphs: [],
          routableDataLinks: [
            {
              systemId: 5,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              linkType: DATA_LINK_TYPE.Ec,
            },
          ],
          routableControlLinks: [],
          overlayDataLinks: [],
          overlayControlLinks: [],
          committedUsecases: [],
          sessionEdits: emptyGraphEdits(),
        },
      }),
      idGenerator: {getNextId: jest.fn().mockResolvedValue(701)},
    });

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({systemId: 701, type: 'EC'}),
      {source: SOURCE.AutoRouting},
      undefined,
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [101]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
    expect(staging.descriptors.get(701)).toEqual({
      systemId: 701,
      changeId: 901,
      operation: CHANGE_OPERATION.Create,
      source: SOURCE.AutoRouting,
    });
  });
});
