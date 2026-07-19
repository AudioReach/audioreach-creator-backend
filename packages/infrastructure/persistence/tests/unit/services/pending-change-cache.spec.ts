/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import type {PendingChangeInsert} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {QueryRunner} from 'typeorm';

function makeRow(
  overrides: Partial<PendingChangeInsert> = {},
): PendingChangeInsert {
  return {
    sessionId: 1,
    aggregateId: 10,
    targetSystemId: 100,
    targetTable: ENTITY_NAMES.SpfModule,
    operation: CHANGE_OPERATION.Update,
    fieldPath: 'alias',
    newValue: {alias: 'updated'},
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    groupId: 'grp-1',
    linkedEntityGroupId: null,
    ...overrides,
  };
}

function makeQueryRunner(selectRows: unknown[] = []): QueryRunner & {
  executeCalls: number;
  getManyCallCount: number;
} {
  let executeCalls = 0;
  let getManyCallCount = 0;

  const makeQb = (): any => {
    const qb: any = {
      insert: () => qb,
      into: () => qb,
      values: () => qb,
      orIgnore: () => qb,
      select: () => qb,
      where: () => qb,
      execute: jest.fn(async () => {
        executeCalls++;
      }),
      getMany: jest.fn(async () => {
        getManyCallCount++;
        return selectRows;
      }),
    };
    return qb;
  };

  return {
    manager: {createQueryBuilder: jest.fn(() => makeQb())},
    get executeCalls() {
      return executeCalls;
    },
    get getManyCallCount() {
      return getManyCallCount;
    },
  } as unknown as QueryRunner & {
    executeCalls: number;
    getManyCallCount: number;
  };
}

describe('PendingChangeCache', () => {
  describe('size() and isEmpty()', () => {
    it('starts empty', () => {
      const cache = new PendingChangeCache();
      expect(cache.size()).toBe(0);
      expect(cache.isEmpty()).toBe(true);
    });

    it('reports correct size after enqueueRow calls', () => {
      const cache = new PendingChangeCache();
      cache.enqueueRow(makeRow({targetSystemId: 1}));
      cache.enqueueRow(makeRow({targetSystemId: 2}));
      expect(cache.size()).toBe(2);
      expect(cache.isEmpty()).toBe(false);
    });
  });

  describe('flush()', () => {
    it('does nothing when cache is empty', async () => {
      const cache = new PendingChangeCache();
      const qr = makeQueryRunner();
      await cache.flush(qr);
      expect(qr.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('clears the buffer after a successful flush', async () => {
      const cache = new PendingChangeCache();
      cache.enqueueRow(makeRow());
      const qr = makeQueryRunner();
      await cache.flush(qr);
      expect(cache.size()).toBe(0);
      expect(cache.isEmpty()).toBe(true);
    });

    it('issues two INSERT execute() calls for 600 UPDATE rows (500 + 100 chunking)', async () => {
      const cache = new PendingChangeCache();
      for (let i = 0; i < 600; i++)
        cache.enqueueRow(makeRow({targetSystemId: i + 1}));
      // Provide 600 version rows so INSERT OR IGNORE chunking is exercised
      const versionRows = Array.from({length: 600}, (_, i) => ({
        systemId: i + 1,
        version: 1,
      }));
      const qr = makeQueryRunner(versionRows);
      await cache.flush(qr);
      // 1 getMany (SELECT for SpfModule) + 2 INSERT OR IGNORE (500+100) + 2 INSERT edit_actions (500+100)
      expect(qr.getManyCallCount).toBe(1);
      expect(qr.executeCalls).toBe(4);
    });

    it('skips baseVersion capture for CREATE rows (no SELECT or INSERT OR IGNORE)', async () => {
      const cache = new PendingChangeCache();
      cache.enqueueRow(makeRow({operation: CHANGE_OPERATION.Create}));
      const qr = makeQueryRunner();
      await cache.flush(qr);
      // CREATE → no baseVersion step → no getMany, just 1 INSERT execute
      expect(qr.getManyCallCount).toBe(0);
      expect(qr.executeCalls).toBe(1);
    });

    it('triggers baseVersion capture for DELETE rows automatically', async () => {
      const cache = new PendingChangeCache();
      cache.enqueueRow(
        makeRow({operation: CHANGE_OPERATION.Delete, targetSystemId: 50}),
      );
      const versionRow = [{systemId: 50, version: 3}];
      const qr = makeQueryRunner(versionRow);
      await cache.flush(qr);
      // DELETE → getMany called, INSERT OR IGNORE called, INSERT edit_actions called
      expect(qr.getManyCallCount).toBe(1);
      expect(qr.executeCalls).toBe(2); // INSERT OR IGNORE + INSERT edit_actions
    });

    it('issues one getMany() per table and chunked INSERT OR IGNORE for 1200 UPDATE targets', async () => {
      // 1200 UPDATE rows across 2 entity types → 2 getMany + 3 INSERT OR IGNORE (500+500+200)
      const cache = new PendingChangeCache();
      for (let i = 0; i < 600; i++)
        cache.enqueueRow(
          makeRow({targetTable: ENTITY_NAMES.SpfModule, targetSystemId: i + 1}),
        );
      for (let i = 0; i < 600; i++)
        cache.enqueueRow(
          makeRow({
            targetTable: ENTITY_NAMES.DataLink,
            targetSystemId: i + 1001,
          }),
        );

      const versionRows = Array.from({length: 600}, (_, i) => ({
        systemId: i + 1,
        version: 1,
      }));
      const qr = makeQueryRunner(versionRows);
      await cache.flush(qr);

      expect(qr.getManyCallCount).toBe(2); // one SELECT per entity type
      expect(qr.executeCalls).toBe(6); // 3 INSERT OR IGNORE (500+500+200) + 3 INSERT edit_actions (500+500+200)
    });
  });
});
