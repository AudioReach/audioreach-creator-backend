/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {Result} from '../../../../../../src/application/shared/result/result.js';
import {emptyGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingGraphSnapshot} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {CreateManualUsecasesCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.command.js';
import {CreateManualUsecasesHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.handler.js';
import {createEmptyRoutingOutcome} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-outcome.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';

function snapshot(): RoutingGraphSnapshot {
  return {
    subgraphs: [
      {
        subgraph: {systemId: 10} as never,
        requestedSgkvs: [],
        isMdf: false,
      },
    ],
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
  };
}

function createUow(
  events: string[],
  activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[] = [],
) {
  const findAll = jest.fn(async () => []);
  return {
    startTransaction: jest.fn(async () => events.push('transaction:start')),
    commit: jest.fn(async () => events.push('transaction:commit')),
    rollback: jest.fn(async () => events.push('transaction:rollback')),
    isInTransaction: jest.fn(() => true),
    getWriteContext: () => ({session: {sessionId: 7}, groupId: 'group-1'}),
    getSubgraphRepository: () => ({
      findChangedInSession: jest.fn(async () => {
        events.push('edits:read');
        return {added: [], deleted: []};
      }),
    }),
    getDataLinkRepository: () => ({
      findChangedInSession: jest.fn(async () => {
        events.push('edits:read');
        return {added: [], deleted: []};
      }),
    }),
    getControlLinkRepository: () => ({
      findChangedInSession: jest.fn(async () => {
        events.push('edits:read');
        return {added: [], deleted: []};
      }),
    }),
    getUsecaseRepository: () => ({
      findWithActiveManualEdits: jest.fn(async () => {
        events.push('manual-edits:read');
        return activeManualUsecaseEdits;
      }),
      findAll,
      findBySystemIds: jest.fn(async () => {
        events.push('selected-usecases:read');
        return [];
      }),
    }),
    findAll,
  };
}

function topologySnapshot(
  subgraphSystemIds: readonly number[],
  routableDataLinks: readonly unknown[],
  routableControlLinks: readonly unknown[],
  overlayDataLinks: readonly unknown[] = [],
) {
  return {
    subgraphs: subgraphSystemIds.map(systemId => ({
      subgraph: {systemId},
      requestedSgkvs: [],
      isMdf: false,
    })),
    routableDataLinks,
    routableControlLinks,
    overlayDataLinks,
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
  };
}

function topologyCommand(
  selectedUsecaseSystemIds: readonly string[],
  subgraphSystemIds: readonly number[],
  excludedSubgraphSystemIds: readonly number[] = [],
) {
  return new CreateManualUsecasesCommand(1, {
    selectedUsecaseSystemIds,
    activeSubgraphs: subgraphSystemIds.map(systemId => ({
      systemId: String(systemId),
      valueSystemIds: [],
    })),
    excludedSubgraphSystemIds: excludedSubgraphSystemIds.map(String),
  });
}

function createTopologyWorkflowFixture(options: {
  readonly selectedUsecases: readonly unknown[];
  readonly graphSnapshot: unknown;
  readonly deletedSubgraphs?: readonly unknown[];
}) {
  let resultingTopology: unknown;
  let resultingGraphSnapshot: unknown;
  const persistedResults: unknown[] = [];
  let committed = false;
  let rolledBack = false;
  const uow = {
    startTransaction: async () => undefined,
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    isInTransaction: () => true,
    getWriteContext: () => ({session: {sessionId: 7}, groupId: 'group-1'}),
    getSubgraphRepository: () => ({
      findChangedInSession: async () => ({
        added: [],
        deleted: options.deletedSubgraphs ?? [],
      }),
    }),
    getDataLinkRepository: () => ({
      findChangedInSession: async () => ({added: [], deleted: []}),
    }),
    getControlLinkRepository: () => ({
      findChangedInSession: async () => ({added: [], deleted: []}),
    }),
    getUsecaseRepository: () => ({
      findWithActiveManualEdits: async () => [],
      findBySystemIds: async () => options.selectedUsecases,
    }),
  };
  const snapshotBuilder = {
    build: async (input: {
      readonly effectiveActiveSubgraphs: readonly {readonly systemId: number}[];
    }) => {
      const effectiveIds = new Set(
        input.effectiveActiveSubgraphs.map(subgraph => subgraph.systemId),
      );
      const graphSnapshot = options.graphSnapshot as {
        readonly subgraphs: readonly {
          readonly subgraph: {readonly systemId: number};
        }[];
        readonly routableDataLinks: readonly {
          readonly sourceSubgraphSystemId: number;
          readonly destSubgraphSystemId: number;
        }[];
        readonly routableControlLinks: readonly {
          readonly sourceSubgraphSystemId: number;
          readonly destSubgraphSystemId: number;
        }[];
        readonly overlayDataLinks: readonly {
          readonly sourceSubgraphSystemId: number;
          readonly destSubgraphSystemId: number;
        }[];
      };
      return Result.ok({
        ...graphSnapshot,
        subgraphs: graphSnapshot.subgraphs.filter(item =>
          effectiveIds.has(item.subgraph.systemId),
        ),
        routableDataLinks: graphSnapshot.routableDataLinks.filter(
          link =>
            effectiveIds.has(link.sourceSubgraphSystemId) &&
            effectiveIds.has(link.destSubgraphSystemId),
        ),
        routableControlLinks: graphSnapshot.routableControlLinks.filter(
          link =>
            effectiveIds.has(link.sourceSubgraphSystemId) &&
            effectiveIds.has(link.destSubgraphSystemId),
        ),
        overlayDataLinks: graphSnapshot.overlayDataLinks.filter(
          link =>
            effectiveIds.has(link.sourceSubgraphSystemId) &&
            effectiveIds.has(link.destSubgraphSystemId),
        ),
      });
    },
  };
  const engine = {
    run: async (input: {
      readonly manualTopology: unknown;
      readonly graphSnapshot: unknown;
    }) => {
      resultingTopology = input.manualTopology;
      resultingGraphSnapshot = input.graphSnapshot;
      persistedResults.push(input.manualTopology);
      return Result.ok(createEmptyRoutingOutcome('group-1'));
    },
  };
  const handler = new CreateManualUsecasesHandler(
    uow as never,
    {} as never,
    {resolveAllChains: async () => Result.ok([])} as never,
    engine as never,
    snapshotBuilder as never,
  );

  return {
    handler,
    persistedResults,
    get resultingTopology() {
      return resultingTopology;
    },
    get resultingGraphSnapshot() {
      return resultingGraphSnapshot;
    },
    get committed() {
      return committed;
    },
    get rolledBack() {
      return rolledBack;
    },
  };
}

describe('manual topology workflow outcomes', () => {
  it('does not emit an overlay-only relationship when its routable data is excluded', async () => {
    const fixture = createTopologyWorkflowFixture({
      selectedUsecases: [
        {
          systemId: 100,
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        },
      ],
      graphSnapshot: topologySnapshot(
        [1, 2],
        [],
        [
          {
            systemId: 21,
            sourceSubgraphSystemId: 1,
            destSubgraphSystemId: 2,
          },
        ],
        [
          {
            systemId: 11,
            sourceSubgraphSystemId: 1,
            destSubgraphSystemId: 2,
          },
        ],
      ),
    });

    await fixture.handler.handle(topologyCommand(['100'], [1, 2]));

    expect(fixture.resultingTopology).toEqual({pairs: []});
  });

  it('fails before persisting a manual-usecase result when the discovered data topology cycles', async () => {
    const fixture = createTopologyWorkflowFixture({
      selectedUsecases: [
        {
          systemId: 100,
          subgraphSystemIds: [1, 2, 3],
          subgraphPairs: [
            {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
            {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
            {sourceSubgraphSystemId: 3, destSubgraphSystemId: 1},
          ],
        },
      ],
      graphSnapshot: topologySnapshot(
        [1, 2, 3],
        [
          {systemId: 12, sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
          {systemId: 23, sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
          {systemId: 31, sourceSubgraphSystemId: 3, destSubgraphSystemId: 1},
        ],
        [],
      ),
    });

    await expect(
      fixture.handler.handle(topologyCommand(['100'], [1, 2, 3])),
    ).rejects.toThrow(
      'Manual topology contains a data-link cycle: 1 -> 2 -> 3 -> 1',
    );

    expect(fixture.persistedResults).toEqual([]);
    expect(fixture.committed).toBe(false);
    expect(fixture.rolledBack).toBe(true);
  });

  it('excludes unavailable subgraphs from the snapshot and resulting manual topology', async () => {
    const fixture = createTopologyWorkflowFixture({
      selectedUsecases: [
        {
          systemId: 100,
          subgraphSystemIds: [1, 2, 3],
          subgraphPairs: [
            {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
            {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
          ],
        },
      ],
      deletedSubgraphs: [{systemId: 3}],
      graphSnapshot: topologySnapshot(
        [1, 2, 3],
        [
          {systemId: 12, sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
          {systemId: 23, sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        ],
        [],
      ),
    });

    await fixture.handler.handle(topologyCommand(['100'], [1, 2, 3], [2]));

    const graphSnapshot = fixture.resultingGraphSnapshot as {
      readonly subgraphs: readonly {
        readonly subgraph: {readonly systemId: number};
      }[];
    };
    expect(graphSnapshot.subgraphs.map(item => item.subgraph.systemId)).toEqual(
      [1],
    );
    expect(fixture.resultingTopology).toEqual({pairs: []});
  });
});

const idGeneration = {getNextId: jest.fn(async () => 100)} as never;

describe('CreateManualUsecasesHandler', () => {
  it('rejects duplicate active subgraphs before starting a transaction', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const resolver = {resolveAllChains: jest.fn()};
    const snapshotBuilder = {build: jest.fn()};
    const pairDiscovery = {discover: jest.fn()};
    const engine = {run: jest.fn()};
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      resolver as never,
      engine as never,
      snapshotBuilder as never,
      pairDiscovery as never,
    );

    await expect(
      handler.handle(
        new CreateManualUsecasesCommand(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [
            {systemId: '7', valueSystemIds: [['70']]},
            {systemId: '7', valueSystemIds: [['71']]},
          ],
        }),
      ),
    ).rejects.toMatchObject({
      errorCode: 'DOMAIN_RULE_VIOLATION',
      issues: [
        expect.objectContaining({
          code: 'ARC-ROUTING-PREVAL-DUPLICATE-ACTIVE-SUBGRAPH-SELECTION',
        }),
      ],
    });

    expect(events).toEqual([]);
    expect(uow.startTransaction).not.toHaveBeenCalled();
    expect(resolver.resolveAllChains).not.toHaveBeenCalled();
    expect(snapshotBuilder.build).not.toHaveBeenCalled();
    expect(pairDiscovery.discover).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
  });

  it('builds one snapshot, discovers topology from it, and executes in order', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const snapshotBuilder = {
      build: jest.fn(async () => {
        events.push('snapshot:build');
        return Result.ok(snapshot());
      }),
    };
    const pairDiscovery = {
      discover: jest.fn(() => {
        events.push('manual-topology:discover');
        return Result.ok({pairs: []});
      }),
    };
    const engine = {
      run: jest.fn(async () => {
        events.push('engine:run');
        return Result.ok(createEmptyRoutingOutcome('group-1'));
      }),
    };
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      engine as never,
      snapshotBuilder as never,
      pairDiscovery as never,
    );

    await handler.handle(
      new CreateManualUsecasesCommand(1, {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
        excludedSubgraphSystemIds: ['20'],
        excludedDataLinkSystemIds: ['900'],
      }),
    );

    expect(events).toEqual([
      'transaction:start',
      'edits:read',
      'edits:read',
      'edits:read',
      'manual-edits:read',
      'selected-usecases:read',
      'snapshot:build',
      'manual-topology:discover',
      'engine:run',
      'transaction:commit',
    ]);
    expect(snapshotBuilder.build).toHaveBeenCalledTimes(1);
    expect(pairDiscovery.discover).toHaveBeenCalledWith(
      expect.objectContaining({
        subgraphs: snapshot().subgraphs,
        dataLinks: [],
        controlLinks: [],
      }),
    );
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({
          excludedDataLinkSystemIds: [900],
        }),
        graphSnapshot: expect.objectContaining({
          subgraphs: snapshot().subgraphs,
        }),
      }),
      uow,
      idGeneration,
    );
  });

  it('passes the loaded manual edits through without a supplemental UC read', async () => {
    const events: string[] = [];
    const editedUsecase = new UseCase({
      systemId: 17,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [70]},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    });
    const activeEdit: ActiveManualUsecaseEdit = {
      changeId: 700,
      operation: 'UPDATE',
      usecase: editedUsecase,
      referencedComponents: {
        sgSystemIds: [10, 20],
        dataLinkSystemIds: [],
        controlLinkSystemIds: [],
      },
    };
    const uow = createUow(events, [activeEdit]);
    let receivedInput:
      | {readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[]}
      | undefined;
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      {
        run: jest.fn(async (input: typeof receivedInput) => {
          receivedInput = input;
          return Result.ok(createEmptyRoutingOutcome('group-1'));
        }),
      } as never,
      {build: jest.fn(async () => Result.ok(snapshot()))} as never,
      {discover: jest.fn(() => Result.ok({pairs: []}))} as never,
    );

    await handler.handle(
      new CreateManualUsecasesCommand(1, {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
      }),
    );

    expect(receivedInput?.activeManualUsecaseEdits).toEqual([activeEdit]);
    expect(uow.findAll).not.toHaveBeenCalled();
  });

  it('does not discover or execute when snapshot preparation fails', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const rollback = uow.rollback;
    const pairDiscovery = {discover: jest.fn()};
    const engine = {run: jest.fn()};
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      engine as never,
      {
        build: jest.fn(async () =>
          Result.fail(RoutingIssueFactory.dataLinkIntegrity(100, 10, 20)),
        ),
      } as never,
      pairDiscovery as never,
    );

    await expect(
      handler.handle(
        new CreateManualUsecasesCommand(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(pairDiscovery.discover).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('rolls back when pair discovery rejects the snapshot topology', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const rollback = uow.rollback;
    const engine = {run: jest.fn()};
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      engine as never,
      {build: jest.fn(async () => Result.ok(snapshot()))} as never,
      {
        discover: jest.fn(() =>
          Result.fail(RoutingIssueFactory.dataLinkIntegrity(100, 10, 20)),
        ),
      } as never,
    );

    await expect(
      handler.handle(
        new CreateManualUsecasesCommand(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(engine.run).not.toHaveBeenCalled();
  });
});
