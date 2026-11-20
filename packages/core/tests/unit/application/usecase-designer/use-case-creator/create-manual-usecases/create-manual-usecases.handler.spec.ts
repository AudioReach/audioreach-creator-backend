/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {batchOf, notFoundBatch} from '../../../../../helpers/batch-read.js';
import {NO_IDENTITY_READS} from '../../../../../helpers/identity-reads.js';
import {describe, expect, it, jest} from '@jest/globals';
import {Result} from '../../../../../../src/application/shared/result/result.js';
import {
  emptyGraphEdits,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {createEmptyRoutingOutcome} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-outcome.js';
import {CreateManualUsecasesCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.command.js';
import {CreateManualUsecasesHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.handler.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';

const idGeneration = {getNextId: jest.fn(async () => 100)} as never;

function snapshot(): RoutingGraphSnapshot {
  const dataLink = {
    systemId: 801,
    sourceSubgraphSystemId: 10,
    destSubgraphSystemId: 20,
  } as never;
  return {
    subgraphs: [
      {subgraph: {systemId: 10} as never, requestedSgkvs: []},
      {subgraph: {systemId: 20} as never, requestedSgkvs: []},
    ],
    mdf: {effective: new Set(), deleted: new Set()},
    routableDataLinks: [dataLink],
    routableControlLinks: [],
    overlayDataLinks: [dataLink],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
    committedDataLinks: [],
  };
}

function createUow(events: string[]) {
  const dataLink = {
    systemId: 801,
    fileSystemId: 1,
    sourceSubgraphSystemId: 10,
    destSubgraphSystemId: 20,
  } as never;
  return {
    startTransaction: jest.fn(async () => events.push('transaction:start')),
    commit: jest.fn(async () => events.push('transaction:commit')),
    rollback: jest.fn(async () => events.push('transaction:rollback')),
    isInTransaction: jest.fn(() => true),
    getWriteContext: () => ({
      session: {sessionId: 7, fileSystemId: 1},
      groupId: 'group-1',
    }),
    getSubgraphRepository: () => ({
      ...NO_IDENTITY_READS,
      findChangedInSession: jest.fn(async () => ({added: [], deleted: []})),
    }),
    getDataLinkRepository: () => ({
      ...NO_IDENTITY_READS,
      findCanonicalLinks: jest.fn(
        async (_fileSystemId: number, systemIds: number[]) => {
          events.push('data-link:resolve');
          return systemIds.includes(801)
            ? batchOf(ENTITY_TYPE.DataLink, [dataLink])
            : notFoundBatch(ENTITY_TYPE.DataLink, ...systemIds);
        },
      ),
      findChangedInSession: jest.fn(async () => ({added: [], deleted: []})),
    }),
    getControlLinkRepository: () => ({
      ...NO_IDENTITY_READS,
      findCanonicalLinks: jest.fn(
        async (_fileSystemId: number, systemIds: number[]) =>
          notFoundBatch(ENTITY_TYPE.ControlLink, ...systemIds),
      ),
      findChangedInSession: jest.fn(async () => ({added: [], deleted: []})),
    }),
    getModuleRepository: () => NO_IDENTITY_READS,
    getSubsystemRepository: () => NO_IDENTITY_READS,
    getKeyValueDefinitionRepository: () => NO_IDENTITY_READS,
    getUsecaseRepository: () => ({
      ...NO_IDENTITY_READS,
      findActiveManualUseCaseEdits: jest.fn(async () => []),
      findUseCaseChangeDetails: jest.fn(async () => {
        events.push('change-details:read');
        return [];
      }),
    }),
  };
}

describe('CreateManualUsecasesHandler', () => {
  it('rejects duplicate active subgraphs before starting a transaction', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {resolveAllChains: jest.fn()} as never,
      {run: jest.fn()} as never,
      {build: jest.fn()} as never,
    );

    await expect(
      handler.handle(
        new CreateManualUsecasesCommand(1, {
          activeSubgraphs: [
            {systemId: '10', valueSystemIds: []},
            {systemId: '10', valueSystemIds: []},
          ],
          includedDataLinkSystemIds: [],
          includedControlLinkSystemIds: [],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('resolves raw selections and assembles the routable topology before execution', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const engine = {
      run: jest.fn(async input => {
        events.push('engine:run');
        return Result.ok(createEmptyRoutingOutcome('group-1'));
      }),
    };
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      {
        resolveAllChains: jest.fn(async () => {
          events.push('chains:resolve');
          return Result.ok();
        }),
      } as never,
      engine as never,
      {
        build: jest.fn(async () => {
          events.push('snapshot:build');
          return Result.ok(snapshot());
        }),
      } as never,
    );

    await handler.handle(
      new CreateManualUsecasesCommand(1, {
        activeSubgraphs: [
          {systemId: '10', valueSystemIds: []},
          {systemId: '20', valueSystemIds: []},
        ],
        includedDataLinkSystemIds: ['801'],
        includedControlLinkSystemIds: [],
      }),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        'transaction:start',
        'chains:resolve',
        'data-link:resolve',
        'snapshot:build',
        'engine:run',
        'change-details:read',
        'transaction:commit',
      ]),
    );
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedUsecases: [],
        manualTopology: expect.objectContaining({
          pairs: [
            expect.objectContaining({
              dataLinks: [expect.objectContaining({systemId: 801})],
            }),
          ],
        }),
      }),
      uow,
      idGeneration,
    );
  });

  it('rolls back without executing the engine when chain resolution fails', async () => {
    const events: string[] = [];
    const uow = createUow(events);
    const engine = {run: jest.fn()};
    const resolver = {
      resolveAllChains: jest.fn(async () =>
        Result.fail(RoutingIssueFactory.incompleteDataChain([1], 10, 20)),
      ),
    };
    const handler = new CreateManualUsecasesHandler(
      uow as never,
      idGeneration,
      resolver as never,
      engine as never,
      {build: jest.fn()} as never,
    );

    await expect(
      handler.handle(
        new CreateManualUsecasesCommand(1, {
          activeSubgraphs: [],
          includedDataLinkSystemIds: [],
          includedControlLinkSystemIds: [],
        }),
      ),
    ).rejects.toMatchObject({errorCode: 'DOMAIN_RULE_VIOLATION'});

    expect(resolver.resolveAllChains).toHaveBeenCalledWith(uow, idGeneration);
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(engine.run).not.toHaveBeenCalled();
  });
});
