/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {
  RESULT_KIND,
  Result,
} from '../../../../../../src/application/shared/result/result.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {RoutingEngine} from '../../../../../../src/application/usecase-designer/use-case-creator/engine/routing-engine.js';
import {DfsRoutingService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing.service.js';
import {CombinationExpansionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion.service.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';

const input = createAutoRoutingInput({
  fileSystemId: 7,
  selectedUsecases: [],
  requestPolicy: {
    requestedSubgraphSystemIds: new Set([10]),
    explicitlyExcludedSubgraphSystemIds: new Set(),
    explicitlyExcludedDataLinkSystemIds: new Set(),
    explicitlyExcludedControlLinkSystemIds: new Set(),
  },
  graphSnapshot: {
    subgraphs: [
      {subgraph: {systemId: 10} as never, requestedSgkvs: [], isMdf: false},
    ],
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
  },
});

function phase(
  name: string,
  order: string[],
  action?: (
    context: RoutingContext,
  ) => ReturnType<typeof Result.fail> | ReturnType<typeof Result.ok<void>>,
) {
  return {
    run: jest.fn(async (context: RoutingContext) => {
      order.push(name);
      return action?.(context) ?? Result.ok();
    }),
  };
}

function engineFrom(phases: ReturnType<typeof phase>[]): RoutingEngine {
  return new RoutingEngine(
    phases[0] as never,
    phases[1] as never,
    phases[2] as never,
    phases[3] as never,
    phases[4] as never,
    phases[5] as never,
    phases[6] as never,
    phases[7] as never,
    phases[8] as never,
    phases[9] as never,
    phases[10] as never,
    phases[11] as never,
  );
}

function unitOfWork() {
  return {
    getSubgraphRepository: () => ({}),
    getWriteContext: () => ({groupId: 'group-1'}),
  } as never;
}

describe('RoutingEngine', () => {
  it('stops before Phase 9 when Phase 8 returns DFS-08', async () => {
    const blockingInput = createAutoRoutingInput({
      fileSystemId: 7,
      selectedUsecases: [],
      requestPolicy: {
        requestedSubgraphSystemIds: new Set([1, 2]),
        explicitlyExcludedSubgraphSystemIds: new Set(),
        explicitlyExcludedDataLinkSystemIds: new Set(),
        explicitlyExcludedControlLinkSystemIds: new Set(),
      },
      graphSnapshot: {
        subgraphs: [
          {subgraph: {systemId: 1} as never, requestedSgkvs: [], isMdf: false},
          {subgraph: {systemId: 2} as never, requestedSgkvs: [], isMdf: false},
        ],
        routableDataLinks: [
          {
            systemId: 1,
            linkType: LINK_TYPE.IntraUsecase,
            sourceSubgraphSystemId: 1,
            destSubgraphSystemId: 2,
          } as never,
        ],
        routableControlLinks: [],
        overlayDataLinks: [],
        overlayControlLinks: [],
        committedUsecases: [],
        sessionEdits: emptyGraphEdits(),
      },
    });
    const order: string[] = [];
    let executedContext: RoutingContext | undefined;
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order),
    );
    phases[3] = phase('phase-4', order, context => {
      context.kvResolutions = {
        perSg: new Map([
          [1, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 100}]}]],
          [2, [{keyValues: [{keyDefSystemId: 10, valueDefSystemId: 101}]}]],
        ]),
        ucFilteredBaseline: new Map(),
      };
      return Result.ok();
    });
    phases[5] = phase('phase-6', order, context => {
      context.cones = {
        sgSystemIds: new Set([1, 2]),
        rootSgs: new Set([1]),
      };
      return Result.ok();
    });
    const dfs = new DfsRoutingService();
    phases[6] = {
      run: jest.fn(async (context: RoutingContext) => {
        order.push('phase-7');
        executedContext = context;
        return dfs.run(context);
      }),
    } as never;
    const combinations = new CombinationExpansionService();
    phases[7] = {
      run: jest.fn(async (context: RoutingContext) => {
        order.push('phase-8');
        return combinations.run(context);
      }),
    } as never;
    const engine = engineFrom(phases);

    const result = await engine.run(blockingInput, unitOfWork());

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues[0]?.code).toBe('ARC-ROUTING-DFS-08');
    expect(order).toEqual([
      'phase-1',
      'phase-2',
      'phase-3',
      'phase-4',
      'phase-5',
      'phase-6',
      'phase-7',
      'phase-8',
    ]);
    expect(phases[8]!.run).not.toHaveBeenCalled();
    expect(phases[9]!.run).not.toHaveBeenCalled();
    expect(phases[11]!.run).not.toHaveBeenCalled();
    expect(executedContext?.routingCandidates.combinations).toEqual([]);
  });

  it('stops after a blocking Phase 1 result', async () => {
    const order: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order),
    );
    phases[0] = phase('phase-1', order, () =>
      Result.fail(RoutingIssueFactory.dataLinkIntegrity(100, 10, 20)),
    );
    const engine = engineFrom(phases);

    const result = await engine.run(input, unitOfWork());

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(order).toEqual(['phase-1']);
    for (const laterPhase of phases.slice(1))
      expect(laterPhase.run).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ARC-ROUTING-SGKV-MALFORMED',
      () => RoutingIssueFactory.sgkvMalformed(10, [20, 30]),
    ],
    [
      'ARC-ROUTING-SGKV-VALUE-NOT-FOUND',
      () => RoutingIssueFactory.sgkvValuesNotFound(10, [20]),
    ],
  ])('stops after a blocking Phase 4 %s result', (_label, createIssue) => {
    const order: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order),
    );
    phases[3] = phase('phase-4', order, () => Result.fail(createIssue()));
    const engine = engineFrom(phases);

    return engine.run(input, unitOfWork()).then(result => {
      expect(result.kind).toBe(RESULT_KIND.Fail);
      expect(result.issues[0]?.code).toBe(_label);
      expect(order).toEqual(['phase-1', 'phase-2', 'phase-3', 'phase-4']);
      for (const laterPhase of phases.slice(4))
        expect(laterPhase.run).not.toHaveBeenCalled();
    });
  });

  it('retains Phase 1 warnings while all phases continue in fixed order', async () => {
    const order: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order),
    );
    phases[0] = phase('phase-1', order, context => {
      context.warnings.push(RoutingIssueFactory.islandDetected(10));
      return Result.ok();
    });
    const engine = engineFrom(phases);
    const result = await engine.run(input, unitOfWork());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(order).toEqual(
      Array.from({length: 12}, (_, index) => `phase-${index + 1}`),
    );
    if (result.kind === RESULT_KIND.Ok)
      expect(result.data?.issues).toEqual([
        expect.objectContaining({code: 'ARC-ROUTING-ISLAND-DETECTED'}),
      ]);
  });

  it('passes the same graph snapshot reference to every phase', async () => {
    const order: string[] = [];
    const snapshots: unknown[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order, context => {
        snapshots.push(context.input.graphSnapshot);
        return Result.ok();
      }),
    );
    const engine = engineFrom(phases);

    await engine.run(input, unitOfWork());

    expect(snapshots).toHaveLength(12);
    expect(snapshots.every(snapshot => snapshot === input.graphSnapshot)).toBe(
      true,
    );
  });
});
