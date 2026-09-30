/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {OrphanValidationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/orphan-validation.phase.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingCombination} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ClassificationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/classification.phase.js';

function candidate(path: number[]): RoutingCombination {
  return {
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(path.map(systemId => [systemId, {keyValues: []}])),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

function makeContext(): RoutingContext {
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
      subgraphs: [
        {subgraph: {systemId: 10, sgkvs: []}, requestedSgkvs: [], isMdf: false},
        {
          subgraph: {systemId: 20, sgkvs: [{}]},
          requestedSgkvs: [],
          isMdf: false,
        },
      ],
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [
        {systemId: 300, sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      ],
      overlayControlLinks: [
        {systemId: 400, sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
      ],
      committedUsecases: [
        new UseCase({
          systemId: 1,
          fileSystemId: 1,
          keyVector: {valueSystemIds: [11]},
          subgraphSystemIds: [10],
          subgraphPairs: [],
        }),
      ],
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

describe('OrphanValidationPhase', () => {
  it('uses the MANUAL authority and leaves discarded automatic topology eligible for orphan reporting', async () => {
    const context = makeContext();
    const committed = new UseCase({
      systemId: 99,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [100]},
      subgraphSystemIds: [9],
      subgraphPairs: [],
    });
    const manual = new UseCase({
      systemId: 99,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [100]},
      subgraphSystemIds: [1, 3, 5],
      subgraphPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 5},
      ],
    });
    const snapshot = context.input.graphSnapshot as unknown as Record<
      string,
      unknown
    >;
    snapshot.subgraphs = [1, 2, 3, 4, 5, 6].map(systemId => ({
      subgraph: {systemId, sgkvs: []},
      requestedSgkvs: [],
      isMdf: false,
    }));
    snapshot.committedUsecases = [committed];
    snapshot.overlayDataLinks = [
      {systemId: 101, sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      {systemId: 102, sourceSubgraphSystemId: 3, destSubgraphSystemId: 5},
      {systemId: 201, sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
      {systemId: 202, sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      {systemId: 203, sourceSubgraphSystemId: 5, destSubgraphSystemId: 6},
    ];
    snapshot.overlayControlLinks = [];
    const mutableInput = context.input as unknown as Record<string, unknown>;
    mutableInput.activeManualUsecaseEdits = [
      {
        changeId: 700,
        usecase: manual,
        operation: 'UPDATE',
        referencedComponents: {
          sgSystemIds: [1, 3, 5],
          dataLinkSystemIds: [101, 102],
          controlLinkSystemIds: [],
        },
      },
    ];
    context.routingCandidates.combinations.push(
      candidate([1, 2]),
      candidate([3, 4]),
      candidate([5, 6]),
    );
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
    };

    const classification = await new ClassificationPhase().run(context);
    const result = await new OrphanValidationPhase().run(context, {
      findOrphanSubsystemSystemIds: async () => [],
    } as never);

    expect(classification.kind).toBe(RESULT_KIND.Ok);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.orphanCandidates).toEqual(
      expect.arrayContaining([
        {kind: 'SUBGRAPH', systemId: 2},
        {kind: 'SUBGRAPH', systemId: 4},
        {kind: 'SUBGRAPH', systemId: 6},
        {kind: 'DATA_LINK', systemId: 201},
        {kind: 'DATA_LINK', systemId: 202},
        {kind: 'DATA_LINK', systemId: 203},
      ]),
    );
    expect(context.orphanCandidates).not.toEqual(
      expect.arrayContaining([
        {kind: 'SUBGRAPH', systemId: 1},
        {kind: 'SUBGRAPH', systemId: 3},
        {kind: 'SUBGRAPH', systemId: 5},
        {kind: 'DATA_LINK', systemId: 101},
        {kind: 'DATA_LINK', systemId: 102},
      ]),
    );
  });

  it('publishes sorted non-blocking warnings and SGKV hints from the projected snapshot', async () => {
    const context = makeContext();
    const subsystemRepository = {
      findOrphanSubsystemSystemIds: async () => [200],
    } as never;
    const result = await new OrphanValidationPhase().run(
      context,
      subsystemRepository,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.warnings.map(issue => issue.code)).toEqual([
      'ARC-ROUTING-ORPHAN-SUBGRAPH',
      'ARC-ROUTING-ORPHAN-SG-HAS-KVS',
      'ARC-ROUTING-ORPHAN-SUBSYSTEM',
      'ARC-ROUTING-ORPHAN-DATA-LINK',
      'ARC-ROUTING-ORPHAN-CONTROL-LINK',
    ]);
    expect(
      context.orphanCandidates.map(candidate => candidate.systemId),
    ).toEqual([20, 200, 300, 400]);
  });

  it('recognizes MDF members and replacement links from the finalized structural change', async () => {
    const context = makeContext();
    const committed = new UseCase({
      systemId: 101,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      type: 'LINKED',
    });
    const snapshot = context.input.graphSnapshot as unknown as Record<
      string,
      unknown
    >;
    snapshot.subgraphs = [10, 15, 20].map(systemId => ({
      subgraph: {systemId, sgkvs: []},
      requestedSgkvs: [],
      isMdf: systemId === 15,
    }));
    snapshot.committedUsecases = [committed];
    snapshot.overlayDataLinks = [
      {systemId: 301, sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
      {systemId: 302, sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
    ];
    snapshot.overlayControlLinks = [];
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: 'MDF_SUBSTITUTION',
          usecase: committed,
          substitutions: [],
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
            sgkvAssignments: [],
          },
        },
      ],
    };

    const result = await new OrphanValidationPhase().run(context, {
      findOrphanSubsystemSystemIds: async () => [],
    } as never);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.warnings.map(issue => issue.code)).not.toEqual(
      expect.arrayContaining([
        'ARC-ROUTING-ORPHAN-SUBGRAPH',
        'ARC-ROUTING-ORPHAN-DATA-LINK',
      ]),
    );
    expect(context.orphanCandidates).toEqual([]);
  });

  it('still reports genuinely unreferenced subgraphs and links after projection', async () => {
    const context = makeContext();
    const snapshot = context.input.graphSnapshot as unknown as Record<
      string,
      unknown
    >;
    snapshot.subgraphs = [
      ...(snapshot.subgraphs as readonly unknown[]),
      {subgraph: {systemId: 98, sgkvs: []}, requestedSgkvs: [], isMdf: false},
      {subgraph: {systemId: 99, sgkvs: []}, requestedSgkvs: [], isMdf: false},
    ];
    snapshot.overlayDataLinks = [
      ...(snapshot.overlayDataLinks as readonly unknown[]),
      {systemId: 998, sourceSubgraphSystemId: 98, destSubgraphSystemId: 99},
    ];

    const result = await new OrphanValidationPhase().run(context, {
      findOrphanSubsystemSystemIds: async () => [],
    } as never);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.orphanCandidates).toEqual(
      expect.arrayContaining([
        {kind: 'SUBGRAPH', systemId: 98},
        {kind: 'SUBGRAPH', systemId: 99},
        {kind: 'DATA_LINK', systemId: 998},
      ]),
    );
  });
});
