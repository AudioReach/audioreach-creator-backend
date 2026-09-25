/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {
  RESULT_KIND,
  Result,
} from '../../../../../../src/application/shared/result/result.js';
import {RoutingEngine} from '../../../../../../src/application/usecase-designer/use-case-creator/engine/routing-engine.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';

function input() {
  return createAutoRoutingInput({
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
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [],
      overlayControlLinks: [],
      committedUsecases: [],
      sessionEdits: emptyGraphEdits(),
    },
    activeManualUsecaseEdits: [],
  });
}

function phase(order: string, calls: string[]) {
  return {
    run: jest.fn(async () => {
      calls.push(order);
      return Result.ok();
    }),
  };
}

function engine(phases: ReturnType<typeof phase>[]) {
  return new RoutingEngine(...(phases as never));
}

const uow = {
  getSubgraphRepository: () => ({}),
  getSubsystemRepository: () => ({
    findOrphanSubsystemSystemIds: async () => [],
  }),
  getWriteContext: () => ({groupId: 'group-1'}),
};

describe('RoutingEngine Half C chain', () => {
  it('runs Phase 8 through Phase 12 and returns only the routing outcome contract', async () => {
    const calls: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, calls),
    );
    phases[10] = {
      run: jest.fn(async (context: {emittedUcChanges: unknown[]}) => {
        calls.push('phase-11');
        context.emittedUcChanges.push({systemId: 1});
        return Result.ok();
      }),
    } as never;
    phases[11] = {
      run: jest.fn(
        async (context: {emittedUcChanges: unknown[]}, groupId: string) => {
          calls.push('phase-12');
          return Result.ok({
            emittedChanges: [...context.emittedUcChanges],
            issues: [],
            groupId,
          });
        },
      ),
    } as never;

    const result = await engine(phases).run(input(), uow as never);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok)
      expect(Object.keys(result.data)).toEqual([
        'emittedChanges',
        'issues',
        'groupId',
      ]);
    expect(calls).toEqual(
      Array.from({length: 12}, (_, index) => `phase-${index + 1}`),
    );
  });

  it('does not run Phase 12 after a Phase 11 failure', async () => {
    const calls: string[] = [];
    const phases = Array.from({length: 12}, (_, index) =>
      phase(`phase-${index + 1}`, calls),
    );
    phases[10] = {
      run: jest.fn(async () => {
        calls.push('phase-11');
        return Result.fail(
          RoutingIssueFactory.stagingPairEndpointMissing(1, 2),
        );
      }),
    } as never;

    const result = await engine(phases).run(input(), uow as never);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(calls).toEqual([
      ...Array.from({length: 10}, (_, index) => `phase-${index + 1}`),
      'phase-11',
    ]);
    expect(phases[11].run).not.toHaveBeenCalled();
  });
});
