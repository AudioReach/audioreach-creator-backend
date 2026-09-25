/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {Result} from '../../../../../../src/application/shared/result/result.js';
import {emptyGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingGraphSnapshot} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {createEmptyRoutingOutcome} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-outcome.js';
import {CreateUsecasesCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/create-usecases/create-usecases.command.js';
import {CreateUsecasesHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/create-usecases/create-usecases.handler.js';

function snapshot(): RoutingGraphSnapshot {
  return {
    subgraphs: [],
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
  };
}

const idGeneration = {getNextId: jest.fn(async () => 100)} as never;

function createUow(events: string[], options?: {addedSubgraph?: boolean}) {
  const findBySystemIds = jest.fn(async () => {
    events.push('selected-usecases:read');
    return [];
  });
  const findWithActiveManualEdits = jest.fn(async () => {
    events.push('manual-usecase-edits:read');
    return [];
  });
  const changed = (name: string) =>
    jest.fn(async () => {
      events.push(name);
      return {
        added:
          name === 'edits:read' && options?.addedSubgraph
            ? [{systemId: 20}]
            : [],
        deleted: [],
      };
    });
  return {
    uow: {
      startTransaction: jest.fn(async () => events.push('transaction:start')),
      commit: jest.fn(async () => events.push('transaction:commit')),
      rollback: jest.fn(async () => events.push('transaction:rollback')),
      isInTransaction: jest.fn(() => true),
      getWriteContext: () => ({session: {sessionId: 7}, groupId: 'group-1'}),
      getSessionRepository: () => ({
        deleteEditActionsBySource: jest.fn(async () =>
          events.push('auto-actions:clear'),
        ),
      }),
      getSubgraphRepository: () => ({
        findChangedInSession: changed('edits:read'),
      }),
      getDataLinkRepository: () => ({
        findChangedInSession: changed('edits:read'),
      }),
      getControlLinkRepository: () => ({
        findChangedInSession: changed('edits:read'),
      }),
      getUsecaseRepository: () => ({
        findBySystemIds,
        findWithActiveManualEdits,
      }),
    },
    findBySystemIds,
    findWithActiveManualEdits,
  };
}

describe('CreateUsecasesHandler', () => {
  it('rejects duplicate active subgraphs before starting a transaction', async () => {
    const events: string[] = [];
    const catalog = createUow(events);
    const resolver = {resolveAllChains: jest.fn()};
    const snapshotBuilder = {build: jest.fn()};
    const engine = {run: jest.fn()};
    const handler = new CreateUsecasesHandler(
      catalog.uow as never,
      idGeneration,
      resolver as never,
      engine as never,
      snapshotBuilder as never,
    );

    await expect(
      handler.handle(
        new CreateUsecasesCommand(1, {
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
    expect(catalog.uow.startTransaction).not.toHaveBeenCalled();
    expect(resolver.resolveAllChains).not.toHaveBeenCalled();
    expect(snapshotBuilder.build).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
  });

  it('builds one snapshot after validation and executes the engine in order', async () => {
    const events: string[] = [];
    const catalog = createUow(events);
    const resolver = {
      resolveAllChains: jest.fn(async () => {
        events.push('chains:resolve');
        return Result.ok();
      }),
    };
    const snapshotBuilder = {
      build: jest.fn(async () => {
        events.push('snapshot:build');
        return Result.ok(snapshot());
      }),
    };
    const engine = {
      run: jest.fn(async () => {
        events.push('engine:run');
        return Result.ok(createEmptyRoutingOutcome('group-1'));
      }),
    };
    const handler = new CreateUsecasesHandler(
      catalog.uow as never,
      idGeneration,
      resolver as never,
      engine as never,
      snapshotBuilder as never,
    );

    await handler.handle(
      new CreateUsecasesCommand(1, {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [],
      }),
    );

    expect(events).toEqual([
      'transaction:start',
      'chains:resolve',
      'auto-actions:clear',
      'edits:read',
      'edits:read',
      'edits:read',
      'selected-usecases:read',
      'manual-usecase-edits:read',
      'snapshot:build',
      'engine:run',
      'transaction:commit',
    ]);
    expect(snapshotBuilder.build).toHaveBeenCalledTimes(1);
    expect(catalog.findWithActiveManualEdits).toHaveBeenCalledWith(1);
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSystemId: 1,
        selectedUsecases: [],
        graphSnapshot: expect.objectContaining({subgraphs: []}),
        activeManualUsecaseEdits: [],
      }),
      catalog.uow,
      idGeneration,
    );
  });

  it('does not build a snapshot when addition closure validation fails', async () => {
    const events: string[] = [];
    const catalog = createUow(events, {addedSubgraph: true});
    const snapshotBuilder = {build: jest.fn()};
    const engine = {run: jest.fn()};
    const handler = new CreateUsecasesHandler(
      catalog.uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      engine as never,
      snapshotBuilder as never,
    );

    await expect(
      handler.handle(
        new CreateUsecasesCommand(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(snapshotBuilder.build).not.toHaveBeenCalled();
    expect(engine.run).not.toHaveBeenCalled();
    expect(catalog.uow.rollback).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the engine rejects the prepared input', async () => {
    const events: string[] = [];
    const catalog = createUow(events);
    const handler = new CreateUsecasesHandler(
      catalog.uow as never,
      idGeneration,
      {resolveAllChains: jest.fn(async () => Result.ok())} as never,
      {
        run: jest.fn(async () =>
          Result.fail({code: 'ROUTING_FAILED', message: 'failed'} as never),
        ),
      } as never,
      {build: jest.fn(async () => Result.ok(snapshot()))} as never,
    );

    await expect(
      handler.handle(
        new CreateUsecasesCommand(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(catalog.uow.rollback).toHaveBeenCalledTimes(1);
    expect(catalog.uow.commit).not.toHaveBeenCalled();
  });
});
