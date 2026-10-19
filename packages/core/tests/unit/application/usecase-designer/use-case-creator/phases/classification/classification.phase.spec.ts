/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {
  createAutoRoutingInput,
  createDataLinkManualTopologyPair,
  createManualRoutingInput,
  ROUTING_MODE,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingMode} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  SEED_REASON,
  USECASE_CANDIDATE_KIND,
  USECASE_TOPOLOGY_DECISION_KIND,
  type AutoUsecaseCandidate,
  type EcBridgeUsecaseCandidate,
  type ManualUsecaseCandidate,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ClassificationPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/classification.phase.js';
import {USECASE_TYPE} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

function usecase(
  systemId: number,
  subgraphSystemIds: number[],
  subgraphPairs: Array<[number, number]>,
  valueSystemIds: number[],
  type?: UseCase['type'],
): UseCase {
  return {
    systemId,
    fileSystemId: 1,
    subgraphSystemIds,
    subgraphPairs: subgraphPairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    keyVector: {valueSystemIds},
    type,
  } as UseCase;
}

function combination(
  path: number[],
  values: number[],
  assignments: Record<number, number[][]> = {},
): AutoUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(
      path.map(systemId => [
        systemId,
        {
          keyValues: (assignments[systemId] ?? []).map(
            ([keyDefSystemId, valueDefSystemId]) => ({
              keyDefSystemId,
              valueDefSystemId,
            }),
          ),
        },
      ]),
    ),
    gkv: values.map(valueSystemId => ({
      keyDefSystemId: valueSystemId + 1000,
      valueDefSystemId: valueSystemId,
    })),
  };
}

function manualCombination(
  members: number[],
  values: number[],
  pairs: Array<[number, number]>,
  assignments: Record<number, number[][]> = {},
): ManualUsecaseCandidate {
  const autoCandidate = combination(members, values, assignments);
  return {
    kind: USECASE_CANDIDATE_KIND.Manual,
    memberSubgraphSystemIds: members,
    topology: {
      pairs: pairs.map(
        ([sourceSubgraphSystemId, destSubgraphSystemId], index) => ({
          pair: {sourceSubgraphSystemId, destSubgraphSystemId},
          dataLinks: [{systemId: 1000 + index} as never],
          controlLinks: [],
        }),
      ),
    },
    sgkvAssignment: autoCandidate.sgkvAssignment,
    gkv: autoCandidate.gkv,
  };
}

function ecBridgeCombination(
  path: number[],
  values: number[],
): EcBridgeUsecaseCandidate {
  return {
    ...combination(path, values),
    kind: USECASE_CANDIDATE_KIND.EcBridge,
    representativeDataLinkSystemId: 1,
    dataLinkSystemIds: [1],
  };
}

function context(
  committedUsecases: UseCase[] = [],
  activeManualUsecaseEdits: ActiveManualUsecaseEdit[] = [],
  mode: RoutingMode = ROUTING_MODE.Auto,
  manualPairs: Array<[number, number]> = [],
): RoutingContext {
  const input = {
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: [],
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [],
    graphSnapshot: {
      subgraphs: [],
      mdfSubgraphSystemIds: new Set(),
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [],
      overlayControlLinks: [],
      committedUsecases,
      sessionEdits: {
        addedSgs: [],
        deletedSgs: [],
        addedDataLinks: [],
        deletedDataLinks: [],
        addedControlLinks: [],
        deletedControlLinks: [],
      },
    },
    activeManualUsecaseEdits,
  };
  const routingContext = new RoutingContext(
    mode === ROUTING_MODE.Manual
      ? createManualRoutingInput({
          ...input,
          manualTopology: {
            pairs: manualPairs.map(
              ([sourceSubgraphSystemId, destSubgraphSystemId], index) =>
                createDataLinkManualTopologyPair(
                  {sourceSubgraphSystemId, destSubgraphSystemId},
                  [
                    {
                      systemId: 1000 + index,
                      sourceSubgraphSystemId,
                      destSubgraphSystemId,
                      linkType: 'NORMAL',
                      isEc: false,
                    } as never,
                  ],
                ),
            ),
          },
        })
      : createAutoRoutingInput(input),
  );
  routingContext.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  return routingContext;
}

function manualEdit(
  operation: ActiveManualUsecaseEdit['operation'],
  usecaseValue: UseCase,
  changeId = usecaseValue.systemId,
): ActiveManualUsecaseEdit {
  return {
    changeId,
    operation,
    usecase: usecaseValue,
    referencedComponents: {
      sgSystemIds: usecaseValue.subgraphSystemIds,
      dataLinkSystemIds: [],
      controlLinkSystemIds: [],
    },
  };
}

describe('ClassificationPhase', () => {
  it('collapses an exact duplicate into the one unambiguous interior extension', async () => {
    const existing = usecase(1, [10, 30], [[10, 30]], [100, 200]);
    const routingContext = context([existing]);
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([40, 50], [300]),
      combination([10, 30], [200, 100]),
      combination([10, 20, 30], [100, 200], {20: []}),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(
      routingContext.classifiedUcs.map(classification => classification.kind),
    ).toEqual([
      ROUTING_CLASSIFICATION_KIND.InteriorExtension,
      ROUTING_CLASSIFICATION_KIND.Create,
    ]);
    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({existingUsecase: existing}),
    );
  });

  it('marks an interior extension to a Phase 2 deletion for cancellation', async () => {
    const existing = usecase(1, [10, 30], [[10, 30]], [100, 200]);
    const routingContext = context([existing]);
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: existing,
          deletedComponent: {type: 'SUBGRAPH', systemId: 20},
          reconstructionPaths: [],
        },
      ],
    };
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([10, 20, 30], [100, 200], {20: []}),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
        cancelPendingDelete: true,
      }),
    );
  });

  it('classifies a candidate against the finalized MDF structural change', async () => {
    const existing = usecase(101, [10, 20], [[10, 20]], [100]);
    const routingContext = context([existing]);
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
          usecase: existing,
          rewrites: [],
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
    } as never;
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([10, 15, 20], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: expect.objectContaining({
          systemId: 101,
          subgraphSystemIds: [10, 15, 20],
          subgraphPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
            {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
          ],
        }),
      }),
    ]);
  });

  it('blocks unresolved same-GKV collisions without publishing classifications', async () => {
    const routingContext = context();
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED',
        fixOptions: expect.arrayContaining([
          expect.objectContaining({
            commandType: 'ResolveSameGkvCollisionCommand',
            commandPayload: expect.objectContaining({
              mode: 'SELECT_CANDIDATE',
              alternativeId: expect.any(String),
              replayInput: expect.any(Object),
              collisionAlternatives: [
                expect.objectContaining({
                  kind: 'NEW',
                  alternativeId: expect.any(String),
                }),
                expect.objectContaining({
                  kind: 'NEW',
                  alternativeId: expect.any(String),
                }),
              ],
              selectedTopology: expect.objectContaining({
                subgraphSystemIds: [1, 2],
              }),
            }),
            description: expect.stringContaining('SGs [1, 2]'),
          }),
        ]),
      }),
    ]);
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('emits one issue for four distinct candidates with one GKV', async () => {
    const routingContext = context();
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
      combination([5, 6], [100]),
      combination([7, 8], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toHaveLength(1);
    expect(routingContext.sameGkvCollisionGroups).toHaveLength(1);
    expect(routingContext.sameGkvCollisionGroups[0]?.alternatives).toHaveLength(
      4,
    );
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('emits one issue per GKV instead of one issue per candidate pair', async () => {
    const routingContext = context();
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
      combination([5, 6], [200]),
      combination([7, 8], [200]),
      combination([9, 10], [200]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toHaveLength(2);
    expect(routingContext.sameGkvCollisionGroups).toHaveLength(2);
  });

  it('recognizes an active MANUAL materialization and suppresses automatic classification', async () => {
    const manualUsecase = usecase(99, [1, 2], [[1, 2]], [100]);
    const routingContext = context(
      [],
      [
        {
          changeId: 99,
          operation: 'CREATE',
          usecase: manualUsecase,
          referencedComponents: {
            sgSystemIds: [1, 2],
            dataLinkSystemIds: [],
            controlLinkSystemIds: [],
          },
        } as ActiveManualUsecaseEdit,
      ],
    );
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('accepts an arbitrary MANUAL topology for the GKV as authoritative', async () => {
    const manualUsecase = usecase(
      99,
      [1, 3, 5],
      [
        [1, 3],
        [3, 5],
      ],
      [100],
    );
    const routingContext = context(
      [],
      [
        {
          changeId: 99,
          operation: 'UPDATE',
          usecase: manualUsecase,
          referencedComponents: {
            sgSystemIds: [1, 3, 5],
            dataLinkSystemIds: [],
            controlLinkSystemIds: [],
          },
        } as ActiveManualUsecaseEdit,
      ],
    );
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
      combination([5, 6], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.sameGkvCollisionGroups).toEqual([]);
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('returns an exact match using explicit manual directed pairs', async () => {
    const existing = usecase(1, [10, 20, 30], [[20, 10]], [100, 200]);
    const routingContext = context([existing], [], ROUTING_MODE.Manual, [
      [20, 10],
    ]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([30, 10, 20], [200, 100], [[20, 10]]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: existing,
      }),
    ]);
  });

  it('matches an active manual CREATE absent from committed state', async () => {
    const created = usecase(7, [10, 20], [[10, 20]], [100]);
    const routingContext = context(
      [],
      [manualEdit('CREATE', created)],
      ROUTING_MODE.Manual,
      [[10, 20]],
    );
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([20, 10], [100], [[10, 20]]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: created,
      }),
    );
  });

  it('uses an active manual UPDATE instead of the stale committed topology', async () => {
    const committed = usecase(8, [10, 20], [[10, 20]], [100]);
    const updated = usecase(8, [20, 30], [[20, 30]], [100]);
    const routingContext = context(
      [committed],
      [manualEdit('UPDATE', updated, 80)],
      ROUTING_MODE.Manual,
      [[20, 30]],
    );
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([30, 20], [100], [[20, 30]]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: updated,
      }),
    );
  });

  it('emits manualGkvConflict when an active manual CREATE owns the GKV with different topology', async () => {
    const created = usecase(13, [10, 20], [[10, 20]], [100]);
    const routingContext = context(
      [],
      [manualEdit('CREATE', created)],
      ROUTING_MODE.Manual,
      [[20, 10]],
    );
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[20, 10]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues[0]).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT',
        impactedUsecases: [13],
      }),
    );
    expect(result.issues[0]?.message).toContain('members: [10, 20]');
    expect(result.issues[0]?.message).toContain('pairs: [20->10]');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('ignores a null active manual edit while matching committed state', async () => {
    const committed = usecase(9, [10, 20], [[10, 20]], [100]);
    const routingContext = context(
      [committed],
      [
        {
          changeId: 90,
          operation: 'UPDATE',
          usecase: null,
          referencedComponents: null,
        },
      ],
      ROUTING_MODE.Manual,
      [[10, 20]],
    );
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([20, 10], [100], [[10, 20]]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: committed,
      }),
    );
  });

  it('emits manualGkvConflict when one committed owner has a different directed pair for the same GKV', async () => {
    const existing = usecase(10, [10, 20], [[10, 20]], [100]);
    const routingContext = context([existing], [], ROUTING_MODE.Manual, [
      [20, 10],
    ]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[20, 10]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues[0]).toEqual(
      expect.objectContaining({code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT'}),
    );
    expect(result.issues[0]?.message).toContain('members: [10, 20]');
    expect(result.issues[0]?.message).toContain('pairs: [20->10]');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('emits manualGkvConflict when one committed owner has a different member set for the same GKV', async () => {
    const existing = usecase(11, [10, 20], [[10, 20]], [100]);
    const routingContext = context([existing], [], ROUTING_MODE.Manual, [
      [10, 20],
    ]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 30, 20], [100], [[10, 20]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues[0]).toEqual(
      expect.objectContaining({code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT'}),
    );
    expect(result.issues[0]?.message).toContain('members: [10, 20, 30]');
    expect(result.issues[0]?.message).toContain('pairs: [10->20]');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('creates a manual candidate when its canonical GKV is unowned', async () => {
    const existing = usecase(12, [10, 20], [[10, 20]], [200]);
    const routingContext = context([existing], [], ROUTING_MODE.Manual, [
      [20, 10],
    ]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[20, 10]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('rejects different manual topologies for one GKV in the same request', async () => {
    const routingContext = context([], [], ROUTING_MODE.Manual, [[10, 20]]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[10, 20]]),
      manualCombination([10, 20, 30], [100], [[10, 20]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues[0]).toEqual(
      expect.objectContaining({code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT'}),
    );
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('collapses identical manual candidates for one GKV into one create', async () => {
    const routingContext = context([], [], ROUTING_MODE.Manual, [[10, 20]]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[10, 20]]),
      manualCombination([20, 10], [100], [[10, 20]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('rejects multiple MANUAL overrides for the same GKV', async () => {
    const routingContext = context([], [
      {
        changeId: 91,
        operation: 'UPDATE',
        usecase: usecase(91, [1, 2], [[1, 2]], [100]),
        referencedComponents: {
          sgSystemIds: [1, 2],
          dataLinkSystemIds: [],
          controlLinkSystemIds: [],
        },
      },
      {
        changeId: 92,
        operation: 'UPDATE',
        usecase: usecase(92, [3, 4], [[3, 4]], [100]),
        referencedComponents: {
          sgSystemIds: [3, 4],
          dataLinkSystemIds: [],
          controlLinkSystemIds: [],
        },
      },
    ] as ActiveManualUsecaseEdit[]);

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-MULTIPLE-MANUAL-GKV-OVERRIDES',
        impactedUsecases: [91, 92],
      }),
    ]);
  });

  it('rejects multiple MANUAL overrides in manual mode without a candidate', async () => {
    const routingContext = context(
      [],
      [
        manualEdit('CREATE', usecase(93, [1, 2], [[1, 2]], [100])),
        manualEdit('UPDATE', usecase(94, [3, 4], [[3, 4]], [100])),
      ],
      ROUTING_MODE.Manual,
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-MULTIPLE-MANUAL-GKV-OVERRIDES',
        impactedUsecases: [93, 94],
      }),
    ]);
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('emits manualGkvConflict with candidate context when two committed usecases share the GKV', async () => {
    const owner1 = usecase(10, [10, 20], [[10, 20]], [100]);
    const owner2 = usecase(11, [30, 40], [[30, 40]], [100]);
    const routingContext = context([owner1, owner2], [], ROUTING_MODE.Manual, [
      [10, 20],
    ]);
    routingContext.usecaseCandidates.manualCandidates.push(
      manualCombination([10, 20], [100], [[10, 20]]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues[0]).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT',
        impactedUsecases: [10, 11],
      }),
    );
    expect(result.issues[0]?.message).toContain('members: [10, 20]');
    expect(result.issues[0]?.message).toContain('pairs: [10->20]');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('turns distinct interior extensions into one collision group', async () => {
    const committed = usecase(1, [10, 30], [[10, 30]], [100]);
    const routingContext = context([committed]);
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([10, 20, 30], [100], {20: []}),
      combination([10, 25, 30], [100], {25: []}),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toHaveLength(1);
    expect(routingContext.sameGkvCollisionGroups[0]?.alternatives).toHaveLength(
      3,
    );
  });

  it('classifies dormant EC bridge candidates for Phase 11 staging', async () => {
    const routingContext = context();
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([10, 20], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.Create,
        candidate: expect.objectContaining({
          kind: USECASE_CANDIDATE_KIND.EcBridge,
          path: expect.objectContaining({subgraphSystemIds: [10, 20]}),
        }),
      }),
    ]);
  });

  it('T-EC-legacy-a suppresses a Bridge covered by a stable legacy EC UseCase', async () => {
    const legacy = usecase(
      50,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([legacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [200]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('does not suppress when endpoint overlap omits complete MDF Bridge topology', async () => {
    const endpointOnlyLegacy = usecase(
      50,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([endpointOnlyLegacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 25, 3], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('suppresses only when a surviving EC topology strictly covers every Bridge member and pair', async () => {
    const coveringLegacy = usecase(
      50,
      [1, 2, 25, 3, 4],
      [
        [1, 2],
        [2, 25],
        [25, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([coveringLegacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 25, 3], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('routes equal multi-SG Bridge topology through exact-match classification', async () => {
    const existingBridge = usecase(
      60,
      [2, 25, 3],
      [
        [2, 25],
        [25, 3],
      ],
      [100],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([existingBridge]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 25, 3], [100]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: existingBridge,
      }),
    ]);
  });

  it('uses finalized projected EC topology when deciding strict coverage', async () => {
    const committedLegacy = usecase(
      50,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([committedLegacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
          usecase: committedLegacy,
          rewrites: [],
          structuralChange: {
            addedSubgraphSystemIds: [25],
            removedSubgraphSystemIds: [],
            addedPairs: [
              {sourceSubgraphSystemId: 2, destSubgraphSystemId: 25},
              {sourceSubgraphSystemId: 25, destSubgraphSystemId: 3},
            ],
            removedPairs: [
              {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
            ],
            resultingSubgraphSystemIds: [1, 2, 25, 3, 4],
            resultingPairs: [
              {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
              {sourceSubgraphSystemId: 2, destSubgraphSystemId: 25},
              {sourceSubgraphSystemId: 25, destSubgraphSystemId: 3},
              {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
            ],
            resultingType: USECASE_TYPE.Ec,
            sgkvAssignments: [],
          },
        },
      ],
    };
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 25, 3], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('T-EC-legacy-b keeps a Bridge when either legacy endpoint changed KV', async () => {
    const legacy = usecase(
      50,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([legacy]);
    routingContext.seeds = {
      sgSystemIds: new Set([2]),
      reasons: new Map([[2, SEED_REASON.KvChanged]]),
    };
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('does not let a deletion-marked legacy EC UseCase suppress its Bridge', async () => {
    const legacy = usecase(
      50,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([legacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([50]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: legacy,
          deletedComponent: {type: 'DATA_LINK', systemId: 10},
          reconstructionPaths: [],
        },
      ],
    };
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('never suppresses a regular Left candidate covered by a legacy EC UseCase', async () => {
    const legacy = usecase(
      50,
      [1, 2, 3],
      [
        [1, 2],
        [2, 3],
      ],
      [500],
      USECASE_TYPE.Ec,
    );
    const routingContext = context([legacy]);
    routingContext.seeds = {sgSystemIds: new Set(), reasons: new Map()};
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([1, 2], [200]),
    );

    await new ClassificationPhase().run(routingContext);

    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('preserves an exact existing EC Bridge and creates a changed-GKV Bridge', async () => {
    const existing = usecase(60, [2, 3], [[2, 3]], [100], USECASE_TYPE.Ec);
    const exactContext = context([existing]);
    exactContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [100]),
    );

    await new ClassificationPhase().run(exactContext);

    expect(exactContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        existingUsecase: existing,
      }),
    ]);

    const changedContext = context([existing]);
    changedContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [200]),
    );
    await new ClassificationPhase().run(changedContext);
    expect(changedContext.classifiedUcs).toEqual([
      expect.objectContaining({kind: ROUTING_CLASSIFICATION_KIND.Create}),
    ]);
  });

  it('routes a same-GKV Bridge versus non-EC exact topology through user choice', async () => {
    const linked = usecase(70, [2, 3], [[2, 3]], [100], USECASE_TYPE.Linked);
    const routingContext = context([linked]);
    routingContext.usecaseCandidates.ecBridgeCandidates.push(
      ecBridgeCombination([2, 3], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toEqual([
      expect.objectContaining({code: 'ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED'}),
    ]);
  });

  it('computes an interior extension from the finalized MDF shape', async () => {
    const committed = usecase(102, [10, 20], [[10, 20]], [100]);
    const routingContext = context([committed]);
    routingContext.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
          usecase: committed,
          rewrites: [],
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
    routingContext.usecaseCandidates.automaticCandidates.push(
      combination([10, 30, 15, 20], [100]),
    );

    const result = await new ClassificationPhase().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
        existingUsecase: expect.objectContaining({
          subgraphSystemIds: [10, 15, 20],
          subgraphPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
            {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
          ],
        }),
      }),
    ]);
    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        candidate: expect.objectContaining({
          path: expect.objectContaining({subgraphSystemIds: [10, 30, 15, 20]}),
        }),
      }),
    );
  });
});
