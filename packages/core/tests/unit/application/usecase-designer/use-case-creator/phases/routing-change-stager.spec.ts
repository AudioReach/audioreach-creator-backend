/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {RoutingChangeStager} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-stager.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../src/application/shared/change-vocabulary.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

function candidate(path: readonly number[]) {
  return {
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map([
      [path[0], {keyValues: [{keyDefSystemId: 1, valueDefSystemId: 101}]}],
      ...path.slice(1).map(id => [id, {keyValues: []}] as const),
    ]),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 101}],
  };
}

function context(
  mode:
    | typeof ROUTING_MODE.Auto
    | typeof ROUTING_MODE.Manual = ROUTING_MODE.Auto,
): RoutingContext {
  const routingContext = new RoutingContext({
    mode,
    fileSystemId: 1,
    selectedUsecases: [],
    requestPolicy: {
      requestedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedDataLinkSystemIds: new Set<number>(),
      explicitlyExcludedControlLinkSystemIds: new Set<number>(),
    },
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
      sessionEdits: {
        addedSgs: [],
        deletedSgs: [],
        addedDataLinks: [],
        deletedDataLinks: [],
        addedControlLinks: [],
        deletedControlLinks: [],
      },
    },
    replayInput: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: [],
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    activeManualUsecaseEdits: [],
  } as never);
  routingContext.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  return routingContext;
}

describe('RoutingChangeStager', () => {
  it('stages deterministic CREATE descriptors and canonical per-SG assignments', async () => {
    const routingContext = context();
    routingContext.classifiedUcs.push(
      {kind: 'CREATE', candidate: candidate([10, 20])} as never,
      {kind: 'CREATE', candidate: candidate([20, 30])} as never,
    );
    const create = jest
      .fn()
      .mockResolvedValueOnce({systemId: 700, changeId: 900})
      .mockResolvedValueOnce({systemId: 701, changeId: 901});
    const uow = {
      getUsecaseRepository: () => ({create}),
    };
    const idGenerator = {
      getNextId: jest
        .fn()
        .mockResolvedValueOnce(700)
        .mockResolvedValueOnce(701),
    };

    const result = await new RoutingChangeStager().run(
      routingContext,
      uow as never,
      idGenerator as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({systemId: 700, type: 'EC'}),
      {source: SOURCE.AutoRouting},
      undefined,
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [101]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
    expect(routingContext.emittedUcChanges).toEqual([
      {
        systemId: 700,
        changeId: 900,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
      {
        systemId: 701,
        changeId: 901,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
    ]);
  });

  it('skips exact matches without repository writes', async () => {
    const routingContext = context();
    routingContext.classifiedUcs.push({kind: 'EXACT_MATCH'} as never);
    const create = jest.fn();

    const result = await new RoutingChangeStager().run(
      routingContext,
      {
        getUsecaseRepository: () => ({create}),
      } as never,
      {getNextId: jest.fn()} as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(create).not.toHaveBeenCalled();
    expect(routingContext.emittedUcChanges).toEqual([]);
  });

  it.each([ROUTING_MODE.Auto, ROUTING_MODE.Manual])(
    'stages one identity-preserving MDF UPDATE in %s mode',
    async mode => {
      const routingContext = context(mode);
      const committed = new UseCase({
        systemId: 101,
        fileSystemId: 1,
        keyVector: {valueSystemIds: [701]},
        alias: 'media',
        subgraphSystemIds: [10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
        type: 'LINKED',
      });
      routingContext.topologyChangeAnalysis = {
        affectedUsecaseSystemIds: new Set(),
        decisions: [
          {
            kind: 'MDF_SUBSTITUTION',
            usecase: committed,
            substitutions: [
              {
                removedPair: {
                  sourceSubgraphSystemId: 10,
                  destSubgraphSystemId: 20,
                },
                replacementSubgraphSystemIds: [15],
                replacementPairs: [
                  {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
                  {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
                ],
              },
            ],
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
              sgkvAssignments: [
                {subgraphSystemId: 15, valueDefinitionSystemIds: []},
              ],
            },
          },
        ],
      };
      const applyStructuralChange = jest
        .fn()
        .mockResolvedValue({systemId: 101, changeId: 9001});

      const result = await new RoutingChangeStager().run(
        routingContext,
        {
          getUsecaseRepository: () => ({applyStructuralChange}),
        } as never,
        {getNextId: jest.fn()} as never,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      expect(applyStructuralChange).toHaveBeenCalledWith(
        101,
        {
          removedPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
          ],
          addedSgSystemIds: [15],
          addedPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
            {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
          ],
        },
        {source: SOURCE.AutoRouting},
        undefined,
        [{subgraphSystemId: 15, valueDefinitionSystemIds: []}],
      );
      expect(routingContext.emittedUcChanges).toEqual([
        {
          systemId: 101,
          changeId: 9001,
          operation: CHANGE_OPERATION.Update,
          source: SOURCE.AutoRouting,
        },
      ]);
    },
  );

  it('stages one structural write for combined preservation and degradation', async () => {
    const routingContext = context();
    const committed = new UseCase({
      systemId: 100,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [1, 2, 3, 4],
      subgraphPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      type: 'LINKED',
    });
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([100]),
      decisions: [
        {
          kind: 'TRANSITION_TO_ISLAND',
          usecase: committed,
          dataLinkLossPairs: [
            {
              sourceSubgraphSystemId: 1,
              destSubgraphSystemId: 2,
              deletedDataLinkSystemId: 10,
            },
          ],
          droppedSubgraphSystemIds: [4],
        },
      ],
    };
    const applyStructuralChange = jest
      .fn()
      .mockResolvedValue({systemId: 100, changeId: 9002});

    const result = await new RoutingChangeStager().run(
      routingContext,
      {
        getUsecaseRepository: () => ({applyStructuralChange}),
      } as never,
      {getNextId: jest.fn()} as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(applyStructuralChange).toHaveBeenCalledTimes(1);
    expect(applyStructuralChange).toHaveBeenCalledWith(
      100,
      {
        removedSgSystemIds: [4],
        removedPairs: [{sourceSubgraphSystemId: 3, destSubgraphSystemId: 4}],
        newType: 'ISLAND',
      },
      expect.anything(),
      undefined,
      undefined,
    );
    expect(routingContext.emittedUcChanges).toHaveLength(1);
  });
});
