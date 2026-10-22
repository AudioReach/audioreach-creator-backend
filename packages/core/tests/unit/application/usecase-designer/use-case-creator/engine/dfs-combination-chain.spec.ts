/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  PATH_TERMINATION,
  USECASE_TOPOLOGY_DECISION_KIND,
  type KvResolutions,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ConeComputationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.phase.js';
import {DfsRoutingPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing/dfs-routing.phase.js';
import {CombinationExpansionPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion/combination-expansion.phase.js';
import {ClassificationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/classification.phase.js';
import {RoutingChangeStagingPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/routing-change-staging.phase.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {USECASE_TYPE} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: {systemId} as never,
    requestedSgkvs: [],
  };
}

function makeDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType = DATA_LINK_TYPE.Normal,
): DataLink {
  return {
    systemId,
    linkType,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeContext(
  subgraphSystemIds: readonly number[] = [1, 2],
  links: readonly DataLink[] = [makeDataLink(1, 1, 2)],
  mdfSubgraphSystemIds: readonly number[] = [],
): RoutingContext {
  const context = new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_ID,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: subgraphSystemIds.map(systemId => ({
          systemId,
          sgkvs: [],
        })),
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: {
        subgraphs: subgraphSystemIds.map(makeSubgraph),
        mdf: {
          effective: new Set(mdfSubgraphSystemIds),
          deleted: new Set(),
        },
        routableDataLinks: links,
        routableControlLinks: [],
        overlayDataLinks: links,
        overlayControlLinks: [],
        committedUsecases: [],
        sessionEdits: emptyGraphEdits(),
      },
      activeManualUsecaseEdits: [],
    }),
  );
  context.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  return context;
}

function setKvResolutions(context: RoutingContext): void {
  const kvResolutions: KvResolutions = {
    perSg: new Map([
      [1, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 100}]}]],
      [2, [{keyValues: [{keyDefSystemId: 20, valueDefSystemId: 200}]}]],
      [3, [{keyValues: [{keyDefSystemId: 30, valueDefSystemId: 300}]}]],
      [4, [{keyValues: [{keyDefSystemId: 40, valueDefSystemId: 400}]}]],
      [5, [{keyValues: [{keyDefSystemId: 50, valueDefSystemId: 500}]}]],
    ]),
    ucFilteredBaseline: new Map(),
  };
  context.kvResolutions = kvResolutions;
}

describe('Phase 6 through Phase 8 routing chain', () => {
  it('turns prepared seeds and snapshot links into canonical candidates', async () => {
    const context = makeContext();
    setKvResolutions(context);
    context.seeds = {
      sgSystemIds: new Set([1]),
      reasons: new Map(),
    };
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([9]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: {systemId: 9} as never,
          deletedComponent: {type: 'DATA_LINK', systemId: 1},
          reconstructionPaths: [
            {
              subgraphSystemIds: [4, 5],
              termination: PATH_TERMINATION.NaturalLeaf,
              ecBoundaryLinkId: null,
            },
          ],
        },
      ],
    };
    const coneResult = await new ConeComputationPhase().run(context);
    const dfsResult = await new DfsRoutingPhase().run(context);
    const combinationResult = await new CombinationExpansionPhase().run(
      context,
    );

    expect(coneResult.kind).toBe(RESULT_KIND.Ok);
    expect(dfsResult.kind).toBe(RESULT_KIND.Ok);
    expect(combinationResult.kind).toBe(RESULT_KIND.Ok);
    expect(context.cones?.sgSystemIds).toEqual(new Set([1, 2]));
    expect(context.dfsPaths.map(path => path.subgraphSystemIds)).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(context.usecaseCandidates.automaticCandidates).toHaveLength(2);
    expect(
      context.usecaseCandidates.automaticCandidates.map(
        candidate => candidate.gkv,
      ),
    ).toEqual([
      [
        {keyDefSystemId: 10, valueDefSystemId: 100},
        {keyDefSystemId: 20, valueDefSystemId: 200},
      ],
      [
        {keyDefSystemId: 40, valueDefSystemId: 400},
        {keyDefSystemId: 50, valueDefSystemId: 500},
      ],
    ]);
  });

  it('merges Phase 2 reconstruction paths before expanding combinations', async () => {
    const context = makeContext();
    setKvResolutions(context);
    context.seeds = {sgSystemIds: new Set([1]), reasons: new Map()};
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: {systemId: 1} as never,
          deletedComponent: {type: 'DATA_LINK', systemId: 1},
          reconstructionPaths: [
            {
              subgraphSystemIds: [4, 5],
              termination: PATH_TERMINATION.NaturalLeaf,
              ecBoundaryLinkId: null,
            },
          ],
        },
      ],
    };

    await new ConeComputationPhase().run(context);
    await new DfsRoutingPhase().run(context);
    await new CombinationExpansionPhase().run(context);

    expect(
      context.usecaseCandidates.automaticCandidates.map(
        candidate => candidate.path.subgraphSystemIds,
      ),
    ).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it('T1-017 routes and stages one EC connection as LINKED, EC, LINKED', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3, DATA_LINK_TYPE.Ec),
        makeDataLink(3, 3, 4),
      ],
    );
    setKvResolutions(context);
    context.seeds = {sgSystemIds: new Set([1]), reasons: new Map()};

    const coneResult = await new ConeComputationPhase().run(context);
    const dfsResult = await new DfsRoutingPhase().run(context);
    const expansionResult = await new CombinationExpansionPhase().run(context);
    const classificationResult = await new ClassificationPhase().run(context);
    const create = jest
      .fn()
      .mockResolvedValueOnce({systemId: 100, changeId: 200})
      .mockResolvedValueOnce({systemId: 101, changeId: 201})
      .mockResolvedValueOnce({systemId: 102, changeId: 202});
    const stagingResult = await new RoutingChangeStagingPhase().run(
      context,
      {getUsecaseRepository: () => ({create})} as never,
      {
        getNextId: jest
          .fn()
          .mockResolvedValueOnce(100)
          .mockResolvedValueOnce(101)
          .mockResolvedValueOnce(102),
      } as never,
    );

    expect([
      coneResult.kind,
      dfsResult.kind,
      expansionResult.kind,
      classificationResult.kind,
      stagingResult.kind,
    ]).toEqual([
      RESULT_KIND.Ok,
      RESULT_KIND.Ok,
      RESULT_KIND.Ok,
      RESULT_KIND.Ok,
      RESULT_KIND.Ok,
    ]);
    expect(
      context.usecaseCandidates.automaticCandidates.map(
        candidate => candidate.path.subgraphSystemIds,
      ),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(
      context.usecaseCandidates.ecBridgeCandidates.map(
        candidate => candidate.path.subgraphSystemIds,
      ),
    ).toEqual([[2, 3]]);
    expect(context.classifiedUcs).toHaveLength(3);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: USECASE_TYPE.Linked,
        subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      }),
      expect.anything(),
      undefined,
      expect.any(Array),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: USECASE_TYPE.Ec,
        subgraphPairs: [{sourceSubgraphSystemId: 2, destSubgraphSystemId: 3}],
      }),
      expect.anything(),
      undefined,
      expect.any(Array),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: USECASE_TYPE.Linked,
        subgraphPairs: [{sourceSubgraphSystemId: 3, destSubgraphSystemId: 4}],
      }),
      expect.anything(),
      undefined,
      expect.any(Array),
    );
  });

  it('stages an MDF-transparent EC Bridge with its complete physical topology', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [
        makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 2, 3, DATA_LINK_TYPE.Ec),
        makeDataLink(12, 3, 4, DATA_LINK_TYPE.Ec),
      ],
      [2, 3],
    );
    context.kvResolutions = {
      perSg: new Map([
        [1, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 100}]}]],
        [2, [{keyValues: []}]],
        [3, [{keyValues: []}]],
        [4, [{keyValues: [{keyDefSystemId: 40, valueDefSystemId: 400}]}]],
      ]),
      ucFilteredBaseline: new Map(),
    };
    context.seeds = {sgSystemIds: new Set([1]), reasons: new Map()};

    await new ConeComputationPhase().run(context);
    await new DfsRoutingPhase().run(context);
    const expansionResult = await new CombinationExpansionPhase().run(context);
    await new ClassificationPhase().run(context);
    const create = jest.fn().mockResolvedValue({systemId: 100, changeId: 200});
    const stagingResult = await new RoutingChangeStagingPhase().run(
      context,
      {getUsecaseRepository: () => ({create})} as never,
      {getNextId: jest.fn().mockResolvedValue(100)} as never,
    );

    expect(expansionResult.kind).toBe(RESULT_KIND.Ok);
    expect(stagingResult.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([
      expect.objectContaining({
        representativeDataLinkSystemId: 10,
        dataLinkSystemIds: [10, 11, 12],
        path: expect.objectContaining({subgraphSystemIds: [1, 2, 3, 4]}),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 100},
          {keyDefSystemId: 40, valueDefSystemId: 400},
        ],
      }),
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: USECASE_TYPE.Ec,
        subgraphSystemIds: [1, 2, 3, 4],
        subgraphPairs: [
          {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
          {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
          {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
        ],
      }),
      expect.anything(),
      undefined,
      expect.any(Array),
    );
  });

  it('publishes no candidates when an EC Bridge is incompatible', async () => {
    const context = makeContext(
      [1, 2],
      [makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec)],
    );
    context.kvResolutions = {
      perSg: new Map([
        [1, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 100}]}]],
        [2, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 101}]}]],
      ]),
      ucFilteredBaseline: new Map(),
    };
    context.seeds = {sgSystemIds: new Set([1]), reasons: new Map()};

    await new ConeComputationPhase().run(context);
    await new DfsRoutingPhase().run(context);
    const result = await new CombinationExpansionPhase().run(context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues[0]?.code).toBe('ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE');
    expect(context.usecaseCandidates.automaticCandidates).toEqual([]);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([]);
  });
});
