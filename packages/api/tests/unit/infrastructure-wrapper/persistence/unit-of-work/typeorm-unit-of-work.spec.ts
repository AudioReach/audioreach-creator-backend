/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {SESSION_MODE} from '@arc/core';
import {PendingChangeWriter} from '@arc/persistence';
import {TypeOrmUnitOfWork} from '../../../../../src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.js';
import type {WriteContext} from '@arc/core';
import type {QueryRunner} from 'typeorm';

function makeQueryRunner(): QueryRunner {
  return {
    manager: {connection: {}, getRepository: jest.fn()},
    query: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    connect: jest.fn(),
    release: jest.fn(),
  } as unknown as QueryRunner;
}

function makeCacheStub() {
  return {
    entries: jest.fn().mockReturnValue([]),
    size: jest.fn().mockReturnValue(0),
    isEmpty: jest.fn().mockReturnValue(true),
    clear: jest.fn(),
  };
}

const sampleContext: WriteContext = {
  session: {
    sessionId: 42,
    mode: SESSION_MODE.Designer,
    fileSystemId: 100,
    projectId: '1',
  },
  groupId: 'test-group-uuid',
};

describe('TypeOrmUnitOfWork', () => {
  let qr: QueryRunner;
  let uow: TypeOrmUnitOfWork;
  let cacheStub: ReturnType<typeof makeCacheStub>;
  let flushCachedActions: jest.SpiedFunction<
    PendingChangeWriter['flushCachedActions']
  >;

  beforeEach(() => {
    qr = makeQueryRunner();
    cacheStub = makeCacheStub();
    flushCachedActions = jest
      .spyOn(PendingChangeWriter.prototype, 'flushCachedActions')
      .mockResolvedValue(undefined);
    uow = new TypeOrmUnitOfWork(
      qr,
      {reserveBlock: jest.fn()} as never,
      cacheStub as never,
      {logDebug: jest.fn(), logError: jest.fn()} as never,
    );
  });

  it('stores and returns write context unchanged', () => {
    uow.setWriteContext(sampleContext);
    expect(uow.getWriteContext()).toBe(sampleContext);
  });

  it('throws when write context is read before being set', () => {
    expect(() => uow.getWriteContext()).toThrow('WriteContext not set');
  });

  it('flushes cached intents through the writer', async () => {
    await uow.applyCachedActions();
    expect(flushCachedActions).toHaveBeenCalledWith(qr.manager);
  });

  it('flushes before committing the transaction', async () => {
    await uow.startTransaction();
    await uow.commit();

    expect(flushCachedActions.mock.invocationCallOrder[0]).toBeLessThan(
      (qr.commitTransaction as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('leaves the transaction active when cache flush fails', async () => {
    flushCachedActions.mockRejectedValue(new Error('flush failed'));
    await uow.startTransaction();

    await expect(uow.commit()).rejects.toThrow('flush failed');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(uow.isInTransaction()).toBe(true);
  });

  it('rejects a non-empty cache after the writer returns', async () => {
    cacheStub.isEmpty.mockReturnValue(false);
    await expect(uow.applyCachedActions()).rejects.toThrow(
      'non-empty after flush',
    );
  });
});
