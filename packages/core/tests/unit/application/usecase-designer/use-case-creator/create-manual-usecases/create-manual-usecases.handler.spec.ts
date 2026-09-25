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

function createUow(events: string[]) {
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
      findBySystemIds: jest.fn(async () => {
        events.push('selected-usecases:read');
        return [];
      }),
    }),
  };
}

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
