/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  buildProjectedUsecaseTopology,
  projectUsecaseStructure,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/projected-usecase-topology.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  USECASE_CANDIDATE_KIND,
  type AutoUsecaseCandidate,
  type ManualUsecaseCandidate,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ClassificationPhase} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/classification.phase.js';

function input(
  committedUsecases: readonly UseCase[],
  activeManualUsecaseEdits: readonly unknown[] = [],
  mode: ROUTING_MODE = ROUTING_MODE.Auto,
  manualPairs: Array<[number, number]> = [],
) {
  const routingInput = {
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
    replayInput: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: [],
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    activeManualUsecaseEdits,
    ...(mode === ROUTING_MODE.Manual
      ? {
          manualTopology: {
            pairs: manualPairs.map(
              ([sourceSubgraphSystemId, destSubgraphSystemId], index) => ({
                pair: {sourceSubgraphSystemId, destSubgraphSystemId},
                dataLinks: [
                  {
                    systemId: 1000 + index,
                    sourceSubgraphSystemId,
                    destSubgraphSystemId,
                  },
                ],
                controlLinks: [],
              }),
            ),
          },
        }
      : {}),
  };
  return routingInput as never;
}

function candidate(path: number[]): AutoUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(path.map(systemId => [systemId, {keyValues: []}])),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

function manualCandidate(
  members: number[],
  pairs: Array<[number, number]>,
): ManualUsecaseCandidate {
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
    sgkvAssignment: new Map(
      members.map(systemId => [systemId, {keyValues: []}]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

describe('buildProjectedUsecaseTopology', () => {
  it('projects only an arbitrary MANUAL authority for a GKV with three automatic candidates', async () => {
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
    const context = new RoutingContext(
      input(
        [committed],
        [
          {
            changeId: 700,
            usecase: manual,
            operation: 'UPDATE',
            referencedComponents: {
              sgSystemIds: [1, 3, 5],
              dataLinkSystemIds: [],
              controlLinkSystemIds: [],
            },
          },
        ],
      ),
    );
    context.usecaseCandidates.automaticCandidates.push(
      candidate([1, 2]),
      candidate([3, 4]),
      candidate([5, 6]),
    );
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
    };

    const classification = await new ClassificationPhase().run(context);
    const projected = buildProjectedUsecaseTopology(context);

    expect(classification.kind).toBe('OK');
    expect(context.classifiedUcs).toEqual([]);
    expect(context.sameGkvCollisionGroups).toEqual([]);
    expect(projected.usecases).toHaveLength(1);
    expect(projected.usecases[0]).toEqual(manual);
    expect(projected.subgraphSystemIds).toEqual(new Set([1, 3, 5]));
    expect(projected.directedPairKeys).toEqual(new Set(['1>3', '3>5']));
  });

  it('projects manual candidates with all members and only explicit pairs', async () => {
    const context = new RoutingContext(
      input([], [], ROUTING_MODE.Manual, [[10, 20]]),
    );
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
    };
    context.usecaseCandidates.manualCandidates.push(
      manualCandidate([30, 10, 20], [[20, 10]]),
    );

    const classification = await new ClassificationPhase().run(context);
    const projected = buildProjectedUsecaseTopology(context);

    expect(classification.kind).toBe('OK');
    expect(projected.usecases[0]?.subgraphSystemIds).toEqual([30, 10, 20]);
    expect(projected.usecases[0]?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
    ]);
    expect(projected.directedPairKeys).toEqual(new Set(['20>10']));
    expect(projected.directedPairKeys).not.toEqual(
      expect.arrayContaining(['30>10', '10>20']),
    );
  });

  it('keeps automatic candidate projection on adjacent DFS pairs', async () => {
    const context = new RoutingContext(input([]));
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
    };
    context.usecaseCandidates.automaticCandidates.push(candidate([30, 10, 20]));

    await new ClassificationPhase().run(context);
    const projected = buildProjectedUsecaseTopology(context);

    expect(projected.usecases[0]?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 30, destSubgraphSystemId: 10},
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
    ]);
  });

  it.each([ROUTING_MODE.Auto, ROUTING_MODE.Manual])(
    'replaces a committed UC with the effective manual overlay in %s mode without mutating either entity',
    mode => {
      const committed = new UseCase({
        systemId: 7,
        fileSystemId: 1,
        keyVector: {valueSystemIds: [11]},
        subgraphSystemIds: [10, 20],
        subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      });
      const edited = new UseCase({
        systemId: 7,
        fileSystemId: 1,
        keyVector: {valueSystemIds: [11]},
        subgraphSystemIds: [20, 30],
        subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 30}],
      });
      const context = new RoutingContext(
        input(
          [committed],
          [
            {
              changeId: 1,
              usecase: edited,
              operation: 'UPDATE',
              referencedComponents: null,
            },
          ],
          mode,
        ),
      );

      const projected = buildProjectedUsecaseTopology(context);

      expect([...projected.subgraphSystemIds]).toEqual([20, 30]);
      expect([...projected.directedPairKeys]).toEqual(['20>30']);
      expect(committed.subgraphSystemIds).toEqual([10, 20]);
    },
  );

  it('folds a finalized island transition before downstream consumers', () => {
    const committed = new UseCase({
      systemId: 8,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [1, 2, 3, 4],
      subgraphPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      type: 'LINKED',
    });
    const context = new RoutingContext(input([committed]));
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([8]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
          usecase: committed,
          dataLinkLossPairs: [
            {
              sourceSubgraphSystemId: 1,
              destSubgraphSystemId: 2,
              deletedDataLinkSystemId: 1,
            },
          ],
          droppedSubgraphSystemIds: [4],
        },
      ],
    };

    const projected = buildProjectedUsecaseTopology(context);

    expect(projected.usecases).toHaveLength(1);
    expect(projected.usecases[0]?.type).toBe('ISLAND');
    expect(projected.usecases[0]?.subgraphSystemIds).toEqual([1, 2, 3]);
    expect(projected.usecases[0]?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
    ]);
  });

  it('applies an atomic structural change while preserving aggregate identity', () => {
    const committed = new UseCase({
      systemId: 101,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [501]},
      subgraphSystemIds: [10, 20, 40],
      subgraphPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
      type: 'LINKED',
    });
    const projected = projectUsecaseStructure(committed, {
      removedSubgraphSystemIds: [],
      addedSubgraphSystemIds: [15],
      removedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      addedPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
        {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
      ],
      resultingSubgraphSystemIds: [10, 15, 20, 40],
      resultingPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
        {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
      resultingType: 'LINKED',
      sgkvAssignments: [],
    });

    expect(projected).not.toBe(committed);
    expect(projected.systemId).toBe(101);
    expect(projected.keyVector.valueSystemIds).toEqual([501]);
    expect(projected.subgraphSystemIds).toEqual([10, 15, 20, 40]);
    expect(projected.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
      {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
    ]);
    expect(committed.subgraphSystemIds).toEqual([10, 20, 40]);
    expect(committed.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
    ]);
  });

  it('publishes the final structural shape without a transient island', () => {
    const committed = new UseCase({
      systemId: 101,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      type: 'LINKED',
    });

    const projected = projectUsecaseStructure(committed, {
      removedSubgraphSystemIds: [],
      addedSubgraphSystemIds: [15],
      removedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      addedPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
        {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
      ],
      resultingSubgraphSystemIds: [10, 15, 20],
      resultingPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
        {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
      ],
      resultingType: 'LINKED',
      sgkvAssignments: [],
    });

    expect(projected.type).toBe('LINKED');
    expect(projected.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
      {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
    ]);
  });

  it('folds MDF and ordinary decisions into one final topology before consumers run', () => {
    const mdfUsecase = new UseCase({
      systemId: 101,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      type: 'LINKED',
    });
    const preservedUsecase = new UseCase({
      systemId: 102,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [40, 50, 60],
      subgraphPairs: [{sourceSubgraphSystemId: 40, destSubgraphSystemId: 50}],
      type: 'LINKED',
    });
    const deletedUsecase = new UseCase({
      systemId: 103,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [70, 80],
      subgraphPairs: [{sourceSubgraphSystemId: 70, destSubgraphSystemId: 80}],
      type: 'LINKED',
    });
    const islandUsecase = new UseCase({
      systemId: 104,
      fileSystemId: 1,
      keyVector: {valueSystemIds: []},
      subgraphSystemIds: [90, 100],
      subgraphPairs: [{sourceSubgraphSystemId: 90, destSubgraphSystemId: 100}],
      type: 'LINKED',
    });
    const context = new RoutingContext(
      input([islandUsecase, deletedUsecase, preservedUsecase, mdfUsecase]),
    );
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([102, 103, 104]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
          usecase: mdfUsecase,
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
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.Preserve,
          usecase: preservedUsecase,
          droppedSubgraphSystemIds: [60],
        },
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: deletedUsecase,
          deletedComponent: {type: 'SUBGRAPH', systemId: 70},
          reconstructionPaths: [],
        },
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
          usecase: islandUsecase,
          dataLinkLossPairs: [],
          droppedSubgraphSystemIds: [],
        },
      ],
    };

    const projected = buildProjectedUsecaseTopology(context);

    expect(projected.usecases.map(usecase => usecase.systemId)).toEqual([
      101, 102, 104,
    ]);
    expect(projected.usecases[0]?.subgraphSystemIds).toEqual([10, 15, 20]);
    expect(projected.usecases[0]?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
      {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
    ]);
    expect(projected.usecases[1]?.subgraphSystemIds).toEqual([40, 50]);
    expect(projected.usecases[2]?.type).toBe('ISLAND');
    expect(projected.directedPairKeys).not.toContain('10>20');
    expect(projected.directedPairKeys).toEqual(
      new Set(['10>15', '15>20', '40>50', '90>100']),
    );
  });
});
