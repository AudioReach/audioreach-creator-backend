/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {ManualCandidateRelationshipBuilder} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/manual-candidate-relationship-builder.js';

function useCase(input: {
  readonly subgraphSystemIds: readonly number[];
  readonly subgraphPairs?: readonly {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  }[];
}): UseCase {
  return new UseCase({
    systemId: 1,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...input.subgraphSystemIds],
    subgraphPairs: [...(input.subgraphPairs ?? [])],
  });
}

describe('ManualCandidateRelationshipBuilder', () => {
  const builder = new ManualCandidateRelationshipBuilder();

  it('authorizes selected-selected relationships only when their unordered pair is selected', () => {
    const result = builder.build({
      selectedUsecases: [
        useCase({
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        }),
      ],
      subgraphSystemIds: [1, 2, 3],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
    ]);
  });

  it('retains out-of-selection relationships and canonical-sorts candidates by numeric system ID', () => {
    const result = builder.build({
      selectedUsecases: [
        useCase({
          subgraphSystemIds: [10, 20],
          subgraphPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
          ],
        }),
      ],
      subgraphSystemIds: [30, 10, 20],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
  });

  it('does not authorize a selected-selected relationship found only in an unselected usecase', () => {
    const result = builder.build({
      selectedUsecases: [
        useCase({subgraphSystemIds: [1, 2], subgraphPairs: []}),
      ],
      subgraphSystemIds: [1, 2],
    });

    expect(result).toEqual([]);
  });

  it('keeps selected-out and out-out relationships independently eligible', () => {
    const result = builder.build({
      selectedUsecases: [
        useCase({
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        }),
      ],
      subgraphSystemIds: [4, 2, 3, 1],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 4},
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 4},
      {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
    ]);
  });

  it('collapses duplicate selected-pair rows and treats reversed direction as the same authorization', () => {
    const result = builder.build({
      selectedUsecases: [
        useCase({
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 2, destSubgraphSystemId: 1}],
        }),
        useCase({
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        }),
      ],
      subgraphSystemIds: [2, 1],
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
    ]);
  });

  it('returns no candidates for a one-subgraph scope', () => {
    expect(
      builder.build({selectedUsecases: [], subgraphSystemIds: [7]}),
    ).toEqual([]);
  });
});
