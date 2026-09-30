/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {TypeOrmUnitOfWork} from '../../../../../src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.js';
import type {WriteContext} from '@arc/core';
import {SESSION_MODE} from '@arc/core';
import {
  TypeOrmApplyChangesService,
  TypeOrmDiscardChangesService,
} from '@arc/persistence';
import type {QueryRunner, DataSource} from 'typeorm';

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

function makeDataSource(): DataSource {
  return {
    query: jest.fn(),
    getRepository: jest.fn(),
    createQueryRunner: jest.fn(),
    manager: {},
  } as unknown as DataSource;
}

function makeCacheStub() {
  return {
    flush: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    size: jest.fn<() => number>().mockReturnValue(0),
    isEmpty: jest.fn<() => boolean>().mockReturnValue(true),
    enqueueRow: jest.fn(),
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

describe('TypeOrmUnitOfWork — WriteContext + applyCachedActions', () => {
  let qr: QueryRunner;
  let uow: TypeOrmUnitOfWork;
  let cacheStub: ReturnType<typeof makeCacheStub>;

  beforeEach(() => {
    qr = makeQueryRunner();
    cacheStub = makeCacheStub();
    uow = new TypeOrmUnitOfWork(
      qr,
      {reserveBlock: jest.fn()} as never,
      cacheStub as never,
      {} as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setWriteContext / getWriteContext', () => {
    it('stores the context and returns it unchanged', () => {
      uow.setWriteContext(sampleContext);
      expect(uow.getWriteContext()).toBe(sampleContext);
    });

    it('throws when getWriteContext is called before setWriteContext', () => {
      expect(() => uow.getWriteContext()).toThrow('WriteContext not set');
    });
  });

  describe('applyCachedActions', () => {
    it('delegates to PendingChangeCache.flush with the queryRunner', async () => {
      await uow.applyCachedActions();
      expect(cacheStub.flush).toHaveBeenCalledTimes(1);
      expect(cacheStub.flush).toHaveBeenCalledWith(qr);
    });

    it('throws when cache is non-empty after flush', async () => {
      cacheStub.isEmpty.mockReturnValue(false);
      await expect(uow.applyCachedActions()).rejects.toThrow(
        'non-empty after flush',
      );
    });
  });

  describe('apply and discard instructions', () => {
    it('delegates applyChanges to the transaction-bound apply service', async () => {
      const summary = {
        commitId: 7,
        appliedEntityCount: 3,
        appliedAggregateCount: 2,
      };
      const apply = jest
        .fn<() => Promise<typeof summary>>()
        .mockResolvedValue(summary);
      jest
        .spyOn(TypeOrmApplyChangesService.prototype, 'apply')
        .mockImplementation(apply);
      uow.setWriteContext(sampleContext);

      await expect(uow.applyChanges()).resolves.toEqual(summary);
      expect(apply).toHaveBeenCalledTimes(1);
    });

    it('delegates discardChanges to the transaction-bound discard service', async () => {
      const summary = {discardedEditActionCount: 4};
      const discard = jest
        .fn<() => Promise<typeof summary>>()
        .mockResolvedValue(summary);
      jest
        .spyOn(TypeOrmDiscardChangesService.prototype, 'discard')
        .mockImplementation(discard);
      uow.setWriteContext(sampleContext);

      await expect(uow.discardChanges()).resolves.toEqual(summary);
      expect(discard).toHaveBeenCalledTimes(1);
    });
  });
});
