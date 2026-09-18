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

describe('RoutingEngine', () => {
  it('stops after a blocking Phase 1 result', async () => {
    const order: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, order),
    );
    phases[0] = phase('phase-1', order, () =>
      Result.fail(RoutingIssueFactory.dataLinkIntegrity(100, 10, 20)),
    );
    const engine = engineFrom(phases);

    const result = await engine.run(input, {} as never);

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

    return engine.run(input, {} as never).then(result => {
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
    const uow = {getWriteContext: () => ({groupId: 'group-1'})};

    const result = await engine.run(input, uow as never);

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

    await engine.run(input, {
      getWriteContext: () => ({groupId: 'group-1'}),
    } as never);

    expect(snapshots).toHaveLength(12);
    expect(snapshots.every(snapshot => snapshot === input.graphSnapshot)).toBe(
      true,
    );
  });
});
