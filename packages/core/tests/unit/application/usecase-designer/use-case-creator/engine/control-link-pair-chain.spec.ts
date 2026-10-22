/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import type {KvResolutions} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ClassificationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/classification.phase.js';
import {CombinationExpansionPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion/combination-expansion.phase.js';
import {ConeComputationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.phase.js';
import {DfsRoutingPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing/dfs-routing.phase.js';
import {OrphanValidationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/orphan-validation.phase.js';
import {RoutingChangeStagingPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-staging/routing-change-staging.phase.js';
import {SeedDetectionPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/seed-detection.phase.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

const FILE_SYSTEM_ID = 1;
const DATA_LINKS = [
  dataLink(1, 10, 20),
  dataLink(2, 20, 30),
  dataLink(3, 30, 40),
];
const CONTROL_LINK = controlLink(7, 40, 20);

function dataLink(
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

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as ControlLink;
}

function createContext(
  options: {
    readonly committedUsecases?: readonly UseCase[];
    readonly addedControlLinks?: readonly ControlLink[];
  } = {},
): RoutingContext {
  const subgraphSystemIds = [10, 20, 30, 40];
  const addedControlLinks = options.addedControlLinks ?? [];
  return new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_SYSTEM_ID,
      selection: {
        selectedUsecaseSystemIds: (options.committedUsecases ?? []).map(
          usecase => usecase.systemId,
        ),
        activeSubgraphs: subgraphSystemIds.map(systemId => ({
          systemId,
          sgkvs: [],
        })),
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [...(options.committedUsecases ?? [])],
      graphSnapshot: {
        subgraphs: subgraphSystemIds.map(systemId => subgraph(systemId)),
        mdf: {effective: new Set(), deleted: new Set()},
        routableDataLinks: DATA_LINKS,
        routableControlLinks: [CONTROL_LINK],
        overlayDataLinks: DATA_LINKS,
        overlayControlLinks: [CONTROL_LINK],
        committedUsecases: [...(options.committedUsecases ?? [])],
        sessionEdits: {...emptyGraphEdits(), addedControlLinks},
      },
      activeManualUsecaseEdits: [],
    }),
  );
}

function subgraph(systemId: number): RoutingGraphSnapshot['subgraphs'][number] {
  return {subgraph: {systemId} as never, requestedSgkvs: []};
}

function setKvResolutions(
  context: RoutingContext,
  variantsAtFirstSubgraph = false,
): void {
  const empty = [{keyValues: []}];
  const perSg: KvResolutions['perSg'] = new Map([
    [
      10,
      variantsAtFirstSubgraph
        ? [
            {keyValues: [{keyDefSystemId: 1, valueDefSystemId: 100}]},
            {keyValues: [{keyDefSystemId: 1, valueDefSystemId: 101}]},
          ]
        : empty,
    ],
    [20, empty],
    [30, empty],
    [40, empty],
  ]);
  context.kvResolutions = {
    perSg,
    ucFilteredBaseline: new Map(perSg),
  };
}

describe('control-link pair augmentation through the routing engine', () => {
  it('records one canonical pair for each generated GKV variant', async () => {
    const context = createContext();
    setKvResolutions(context, true);
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
    };
    context.seeds = {sgSystemIds: new Set([10]), reasons: new Map()};
    const create = jest
      .fn()
      .mockResolvedValueOnce({systemId: 100, changeId: 200})
      .mockResolvedValueOnce({systemId: 101, changeId: 201});

    const coneResult = await new ConeComputationPhase().run(context);
    const dfsResult = await new DfsRoutingPhase().run(context);
    const expansionResult = await new CombinationExpansionPhase().run(context);
    const classificationResult = await new ClassificationPhase().run(context);
    const stagingResult = await new RoutingChangeStagingPhase().run(
      context,
      {getUsecaseRepository: () => ({create})} as never,
      {
        getNextId: jest
          .fn()
          .mockResolvedValueOnce(100)
          .mockResolvedValueOnce(101),
      } as never,
    );

    expect(coneResult.kind).toBe(RESULT_KIND.Ok);
    expect(dfsResult.kind).toBe(RESULT_KIND.Ok);
    expect(expansionResult.kind).toBe(RESULT_KIND.Ok);
    expect(classificationResult.kind).toBe(RESULT_KIND.Ok);
    expect(stagingResult.kind).toBe(RESULT_KIND.Ok);
    expect(create).toHaveBeenCalledTimes(2);
    for (const [usecase] of create.mock.calls) {
      expect(usecase).toEqual(
        expect.objectContaining({
          type: USECASE_TYPE.Linked,
          subgraphPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
            {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
          ],
        }),
      );
    }
  });

  it('leaves the UseCase untouched when a control link is added alone', async () => {
    const committedUsecase = new UseCase({
      systemId: 70,
      fileSystemId: FILE_SYSTEM_ID,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [10, 20, 30, 40],
      subgraphPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
      ],
      type: USECASE_TYPE.Linked,
    });
    const context = createContext({
      committedUsecases: [committedUsecase],
      addedControlLinks: [CONTROL_LINK],
    });
    setKvResolutions(context);
    const seedResult = await new SeedDetectionPhase().run(context);
    const orphanResult = await new OrphanValidationPhase().run(context, {
      findOrphanSubsystemSystemIds: async () => [],
    } as never);

    expect(seedResult.kind).toBe(RESULT_KIND.Ok);
    expect(context.seeds.sgSystemIds).toEqual(new Set());
    expect(context.usecaseCandidates.automaticCandidates).toEqual([]);
    expect(context.emittedUcChanges).toEqual([]);
    expect(orphanResult.kind).toBe(RESULT_KIND.Ok);
    expect(context.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'ARC-ROUTING-ORPHAN-CONTROL-LINK'}),
      ]),
    );
  });
});
