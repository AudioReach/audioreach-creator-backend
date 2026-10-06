/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {RoutingChangeStagingPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/routing-change-staging.phase.js';
import {
  ROUTING_MODE,
  type ManualTopologyPair,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../../src/application/shared/change-vocabulary.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';
import {ISSUE_CODE} from '../../../../../../../src/shared/issues/operational-codes.js';
import {
  USECASE_CANDIDATE_KIND,
  type AutoUsecaseCandidate,
  type ManualUsecaseCandidate,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';

function candidate(
  path: readonly number[],
  valueDefSystemId = 101,
): AutoUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map([
      [path[0], {keyValues: [{keyDefSystemId: 1, valueDefSystemId}]}],
      ...path.slice(1).map(id => [id, {keyValues: []}] as const),
    ]),
    gkv: [{keyDefSystemId: 1, valueDefSystemId}],
  };
}

function manualCandidate(
  members: readonly number[],
  topologyPairs: readonly ManualTopologyPair[],
  valueDefSystemId = 101,
  assignedSubgraphSystemId = members[0],
): ManualUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Manual,
    memberSubgraphSystemIds: members,
    topology: {pairs: topologyPairs},
    sgkvAssignment: new Map(
      members.map(systemId => [
        systemId,
        {
          keyValues:
            systemId === assignedSubgraphSystemId
              ? [{keyDefSystemId: 1, valueDefSystemId}]
              : [],
        },
      ]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId}],
  };
}

interface ContextOptions {
  readonly memberSystemIds?: readonly number[];
  readonly manualTopologyPairs?: readonly ManualTopologyPair[];
  readonly routableDataLinks?: readonly unknown[];
  readonly routableControlLinks?: readonly unknown[];
}

function context(
  mode:
    | typeof ROUTING_MODE.Auto
    | typeof ROUTING_MODE.Manual = ROUTING_MODE.Auto,
  options: ContextOptions = {},
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
      subgraphs: (options.memberSystemIds ?? []).map(systemId => ({
        subgraph: {systemId},
        requestedSgkvs: [],
        isMdf: false,
      })),
      routableDataLinks: options.routableDataLinks ?? [
        {
          systemId: 5,
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 20,
          linkType: DATA_LINK_TYPE.Ec,
        },
      ],
      routableControlLinks: options.routableControlLinks ?? [],
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
    ...(mode === ROUTING_MODE.Manual
      ? {manualTopology: {pairs: options.manualTopologyPairs ?? []}}
      : {}),
  } as never);
  routingContext.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  return routingContext;
}

describe('RoutingChangeStagingPhase', () => {
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

    const result = await new RoutingChangeStagingPhase().run(
      routingContext,
      uow as never,
      idGenerator as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        systemId: 700,
        type: USECASE_TYPE.Ec,
        subgraphSystemIds: [10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      }),
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

  it('stages each manual GKV candidate from its owned topology and assignments', async () => {
    const supportedPair = {
      pair: {sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
      dataLinks: [
        {
          systemId: 60,
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 10,
          linkType: DATA_LINK_TYPE.Normal,
        },
        {
          systemId: 50,
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 10,
          linkType: DATA_LINK_TYPE.Normal,
        },
        {
          systemId: 50,
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 10,
          linkType: DATA_LINK_TYPE.Normal,
        },
      ],
      controlLinks: [],
    } as const;
    const routingContext = context(ROUTING_MODE.Manual, {
      memberSystemIds: [30, 10, 20],
      manualTopologyPairs: [],
      routableDataLinks: [
        ...supportedPair.dataLinks,
        {
          systemId: 999,
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 30,
          linkType: DATA_LINK_TYPE.Normal,
        },
      ],
      routableControlLinks: [
        {
          systemId: 998,
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 30,
        },
      ],
    });
    routingContext.classifiedUcs.push(
      {
        kind: 'CREATE',
        candidate: manualCandidate([30, 10, 20], [supportedPair], 101, 10),
      } as never,
      {
        kind: 'CREATE',
        candidate: manualCandidate([30, 10, 20], [supportedPair], 202, 10),
      } as never,
    );
    const create = jest
      .fn()
      .mockResolvedValueOnce({systemId: 700, changeId: 900})
      .mockResolvedValueOnce({systemId: 701, changeId: 901});
    const idGenerator = {
      getNextId: jest
        .fn()
        .mockResolvedValueOnce(700)
        .mockResolvedValueOnce(701),
    };

    const result = await new RoutingChangeStagingPhase().run(
      routingContext,
      {getUsecaseRepository: () => ({create})} as never,
      idGenerator as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    const referencedComponents = {
      sgSystemIds: [10, 20, 30],
      dataLinkSystemIds: [50, 60],
      controlLinkSystemIds: [],
    };
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        systemId: 700,
        keyVector: {valueSystemIds: [101]},
        subgraphSystemIds: [30, 10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 10}],
        type: USECASE_TYPE.Island,
      }),
      {source: SOURCE.Manual},
      referencedComponents,
      [
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
        {subgraphSystemId: 10, valueDefinitionSystemIds: [101]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        systemId: 701,
        keyVector: {valueSystemIds: [202]},
        subgraphSystemIds: [30, 10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 10}],
        type: USECASE_TYPE.Island,
      }),
      {source: SOURCE.Manual},
      referencedComponents,
      [
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
        {subgraphSystemId: 10, valueDefinitionSystemIds: [202]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
    expect(routingContext.emittedUcChanges).toEqual([
      {
        systemId: 700,
        changeId: 900,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.Manual,
      },
      {
        systemId: 701,
        changeId: 901,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.Manual,
      },
    ]);
  });

  it('rejects a manual pair outside the effective members before allocating or writing', async () => {
    const routingContext = context(ROUTING_MODE.Manual, {
      memberSystemIds: [10],
      manualTopologyPairs: [
        {
          pair: {sourceSubgraphSystemId: 10, destSubgraphSystemId: 99},
          dataLinks: [
            {
              systemId: 5,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 99,
              linkType: DATA_LINK_TYPE.Normal,
            },
          ],
          controlLinks: [],
        },
      ],
    });
    routingContext.classifiedUcs.push({
      kind: 'CREATE',
      candidate: manualCandidate(
        [10],
        routingContext.input.mode === ROUTING_MODE.Manual
          ? routingContext.input.manualTopology.pairs
          : [],
      ),
    } as never);
    const create = jest.fn();
    const getNextId = jest.fn();

    const result = await new RoutingChangeStagingPhase().run(
      routingContext,
      {getUsecaseRepository: () => ({create})} as never,
      {getNextId} as never,
    );

    expect(result).toEqual({
      kind: RESULT_KIND.Fail,
      issues: [
        expect.objectContaining({
          code: ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING,
        }),
      ],
    });
    expect(getNextId).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(routingContext.emittedUcChanges).toEqual([]);
  });

  it('skips manual exact matches without repository writes or descriptors', async () => {
    const routingContext = context(ROUTING_MODE.Manual, {
      memberSystemIds: [10],
    });
    routingContext.classifiedUcs.push({kind: 'EXACT_MATCH'} as never);
    const create = jest.fn();
    const applyStructuralChange = jest.fn();
    const deleteUsecase = jest.fn();
    const getNextId = jest.fn();

    const result = await new RoutingChangeStagingPhase().run(
      routingContext,
      {
        getUsecaseRepository: () => ({
          create,
          applyStructuralChange,
          delete: deleteUsecase,
        }),
      } as never,
      {getNextId} as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(create).not.toHaveBeenCalled();
    expect(applyStructuralChange).not.toHaveBeenCalled();
    expect(deleteUsecase).not.toHaveBeenCalled();
    expect(getNextId).not.toHaveBeenCalled();
    expect(routingContext.emittedUcChanges).toEqual([]);
  });

  it('rejects a manual interior extension instead of mutating an existing UseCase', async () => {
    const routingContext = context(ROUTING_MODE.Manual, {
      memberSystemIds: [10, 20],
      manualTopologyPairs: [
        {
          pair: {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
          dataLinks: [
            {
              systemId: 5,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              linkType: DATA_LINK_TYPE.Normal,
            },
          ],
          controlLinks: [],
        },
      ],
    });
    routingContext.classifiedUcs.push({
      kind: 'INTERIOR_EXTENSION',
      candidate: candidate([10, 15, 20]),
      existingUsecase: new UseCase({
        systemId: 100,
        fileSystemId: 1,
        keyVector: {valueSystemIds: [101]},
        subgraphSystemIds: [10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
        type: USECASE_TYPE.Linked,
      }),
      cancelPendingDelete: false,
    } as never);
    const create = jest.fn();
    const applyStructuralChange = jest.fn();
    const deleteUsecase = jest.fn();

    await expect(
      new RoutingChangeStagingPhase().run(
        routingContext,
        {
          getUsecaseRepository: () => ({
            create,
            applyStructuralChange,
            delete: deleteUsecase,
          }),
        } as never,
        {getNextId: jest.fn()} as never,
      ),
    ).rejects.toThrow(
      'Manual routing cannot stage an interior extension classification',
    );
    expect(create).not.toHaveBeenCalled();
    expect(applyStructuralChange).not.toHaveBeenCalled();
    expect(deleteUsecase).not.toHaveBeenCalled();
    expect(routingContext.emittedUcChanges).toEqual([]);
  });

  it('retains automatic adjacent-path updates and automatic source metadata', async () => {
    const routingContext = context();
    const existingUsecase = new UseCase({
      systemId: 100,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [101]},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      type: USECASE_TYPE.Linked,
    });
    routingContext.classifiedUcs.push({
      kind: 'INTERIOR_EXTENSION',
      candidate: candidate([10, 15, 20]),
      existingUsecase,
      cancelPendingDelete: false,
    } as never);
    const applyStructuralChange = jest
      .fn()
      .mockResolvedValue({systemId: 100, changeId: 9100});

    const result = await new RoutingChangeStagingPhase().run(
      routingContext,
      {getUsecaseRepository: () => ({applyStructuralChange})} as never,
      {getNextId: jest.fn()} as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(applyStructuralChange).toHaveBeenCalledWith(
      100,
      {
        addedSgSystemIds: [15],
        addedPairs: [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
          {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
        ],
        removedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
        cancelPendingDelete: false,
      },
      {source: SOURCE.AutoRouting},
      undefined,
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [101]},
        {subgraphSystemId: 15, valueDefinitionSystemIds: []},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
    expect(routingContext.emittedUcChanges).toEqual([
      {
        systemId: 100,
        changeId: 9100,
        operation: CHANGE_OPERATION.Update,
        source: SOURCE.AutoRouting,
      },
    ]);
  });

  it('stages one automatic identity-preserving MDF UPDATE', async () => {
    const routingContext = context();
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

    const result = await new RoutingChangeStagingPhase().run(
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
        removedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
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
  });

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

    const result = await new RoutingChangeStagingPhase().run(
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
