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
  type KvResolutions,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ConeComputationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.service.js';
import {DfsRoutingService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing.service.js';
import {CombinationExpansionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion.service.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';
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
    linkType: LINK_TYPE.IntraUsecase,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeContext(): RoutingContext {
  const links = [makeDataLink(1, 1, 2)];
  return new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_ID,
      selectedUsecases: [],
      requestPolicy: {
        requestedSubgraphSystemIds: new Set([1, 2]),
        explicitlyExcludedSubgraphSystemIds: new Set(),
        explicitlyExcludedDataLinkSystemIds: new Set(),
        explicitlyExcludedControlLinkSystemIds: new Set(),
      },
      graphSnapshot: {
        subgraphs: [1, 2].map(makeSubgraph),
        routableDataLinks: links,
        routableControlLinks: [],
        overlayDataLinks: links,
        overlayControlLinks: [],
        committedUsecases: [],
        sessionEdits: emptyGraphEdits(),
      },
    }),
  );
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
    context.deletionAnalysis = {
      reconstructionPaths: [
        {
          originalUsecaseSystemId: 9,
          path: {
            subgraphSystemIds: [4, 5],
            termination: PATH_TERMINATION.NaturalLeaf,
            ecBoundaryLinkId: null,
          },
        },
      ],
    } as never;
    const coneResult = await new ConeComputationService().run(context);
    const dfsResult = await new DfsRoutingService().run(context);
    const combinationResult = await new CombinationExpansionService().run(
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
    expect(context.routingCandidates.combinations).toHaveLength(2);
    expect(
      context.routingCandidates.combinations.map(candidate => candidate.gkv),
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
    context.deletionAnalysis = {
      reconstructionPaths: [
        {
          originalUsecaseSystemId: 1,
          path: {
            subgraphSystemIds: [4, 5],
            termination: PATH_TERMINATION.NaturalLeaf,
            ecBoundaryLinkId: null,
          },
        },
      ],
    } as never;

    await new ConeComputationService().run(context);
    await new DfsRoutingService().run(context);
    await new CombinationExpansionService().run(context);

    expect(
      context.routingCandidates.combinations.map(
        candidate => candidate.path.subgraphSystemIds,
      ),
    ).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });
});
