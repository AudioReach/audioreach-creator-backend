/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {OrphanValidationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/orphan-validation.phase.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';

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
