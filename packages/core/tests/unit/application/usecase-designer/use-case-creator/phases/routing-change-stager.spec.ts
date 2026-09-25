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

function context(): RoutingContext {
  return new RoutingContext({
    mode: ROUTING_MODE.Auto,
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
});
