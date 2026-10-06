/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
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
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: {systemId} as never,
    requestedSgkvs: [],
    isMdf: false,
  };
}

function makeDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {
    systemId,
    linkType: DATA_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeContext(): RoutingContext {
  const links = [makeDataLink(1, 1, 2)];
  const context = new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_ID,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [
          {systemId: 1, sgkvs: []},
          {systemId: 2, sgkvs: []},
        ],
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: {
        subgraphs: [1, 2].map(makeSubgraph),
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
});
