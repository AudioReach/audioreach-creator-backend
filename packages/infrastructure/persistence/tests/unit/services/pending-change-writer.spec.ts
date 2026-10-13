/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {
  EditActionSchema,
  type EditActionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {SessionEntityVersionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/session-entity-version.schema.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {PendingChangeWriter} from '../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';

const SESSION_ID = 1;
const TARGET = {
  targetTable: ENTITY_NAMES.SpfModule,
  targetSystemId: 100,
  aggregateId: 10,
} as const;

function makeRow(overrides: Partial<EditActionRow> = {}): EditActionRow {
  return {
    changeId: 41,
    sessionId: SESSION_ID,
    aggregateId: TARGET.aggregateId,
    targetSystemId: TARGET.targetSystemId,
    targetTable: TARGET.targetTable,
    operation: CHANGE_OPERATION.Update,
    fieldPath: 'alias',
    newValue: {alias: 'old'},
    source: SOURCE.DiffTool,
    changeStatus: CHANGE_STATUS.Unstaged,
    linkedEntityGroupId: 'linked-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeQueryService(
  rows: EditActionRow[] = [],
): jest.Mocked<EditActionsQueryService> {
  return {
    getAllByTargetKey: jest.fn().mockResolvedValue(rows),
    getAllByTargetKeys: jest.fn().mockResolvedValue(new Map()),
  } as unknown as jest.Mocked<EditActionsQueryService>;
}

type MockManager = EntityManager & {
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
  builder: Record<string, jest.Mock>;
};

function makeManager(
  committedRows: Array<{systemId: number; version?: number}> = [],
): MockManager {
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(committedRows[0]),
    getRawMany: jest.fn().mockResolvedValue(committedRows),
    execute: jest.fn().mockResolvedValue({affected: 1}),
  };
  const createQueryBuilder = jest.fn(() => builder);
  const getRepository = jest.fn(() => ({
    metadata: {
      columns: [{propertyName: 'systemId'}, {propertyName: 'version'}],
    },
    createQueryBuilder: jest.fn(() => builder),
  }));
  return {
    insert: jest.fn().mockResolvedValue({identifiers: [{changeId: 123}]}),
    update: jest.fn().mockResolvedValue({affected: 1}),
    delete: jest.fn().mockResolvedValue({affected: 1}),
    createQueryBuilder,
    getRepository,
    builder,
  } as unknown as MockManager;
}

describe('PendingChangeWriter', () => {
  it('updates an exact slot in place and preserves its stable changeId', async () => {
    const queryService = makeQueryService([makeRow()]);
    const manager = makeManager([
      {systemId: TARGET.targetSystemId, version: 3},
    ]);
    const writer = new PendingChangeWriter(
      queryService,
      new PendingChangeCache(),
    );

    await expect(
      writer.writeDelta(
        {...TARGET, delta: {alias: 'new'}, fieldGroup: 'alias'},
        SESSION_ID,
        manager,
      ),
    ).resolves.toBe(41);

    expect(manager.update).toHaveBeenCalledWith(EditActionSchema, 41, {
      newValue: {alias: 'new'},
      source: SOURCE.Manual,
    });
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('captures the complete target baseline on the first committed mutation', async () => {
    const queryService = makeQueryService([]);
    const manager = makeManager([
      {systemId: TARGET.targetSystemId, version: 3},
    ]);
    const writer = new PendingChangeWriter(
      queryService,
      new PendingChangeCache(),
    );

    await writer.writeDelta(
      {...TARGET, delta: {alias: 'new'}, fieldGroup: 'alias'},
      SESSION_ID,
      manager,
    );

    expect(manager.builder.insert).toHaveBeenCalledTimes(1);
    expect(manager.builder.into).toHaveBeenCalledWith(
      SessionEntityVersionSchema,
    );
    expect(manager.builder.values).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      targetTable: TARGET.targetTable,
      targetSystemId: TARGET.targetSystemId,
      baseVersion: 3,
    });
    expect(manager.builder.orIgnore).toHaveBeenCalledTimes(1);
  });

  it('accepts cached accumulator writes without performing SQL at enqueue', async () => {
    const cache = new PendingChangeCache();
    const manager = makeManager();
    const writer = new PendingChangeWriter(makeQueryService(), cache);

    await expect(
      writer.writeDelta(
        {...TARGET, delta: {alias: 'cached'}, cache: true},
        SESSION_ID,
        manager,
      ),
    ).resolves.toBeNull();

    expect(cache.size()).toBe(1);
    expect(manager.insert).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('preserves CREATE metadata while folding later cached updates', async () => {
    const cache = new PendingChangeCache();
    const queryService = makeQueryService();
    const manager = makeManager([]);
    const writer = new PendingChangeWriter(queryService, cache);

    await writer.writeCreate(
      {
        ...TARGET,
        payload: {alias: 'created'},
        source: SOURCE.DiffTool,
        changeStatus: CHANGE_STATUS.Unstaged,
        cache: true,
      },
      SESSION_ID,
      manager,
    );
    await writer.writeDelta(
      {...TARGET, delta: {alias: 'updated'}, fieldGroup: 'alias'},
      SESSION_ID,
      manager,
    );

    queryService.getAllByTargetKeys.mockResolvedValue(
      new Map([
        [`${SESSION_ID}|${TARGET.targetTable}|${TARGET.targetSystemId}`, []],
      ]),
    );
    await writer.flushCachedActions(manager);

    expect(manager.insert).toHaveBeenCalledWith(EditActionSchema, {
      sessionId: SESSION_ID,
      aggregateId: TARGET.aggregateId,
      targetSystemId: TARGET.targetSystemId,
      targetTable: TARGET.targetTable,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {alias: 'updated'},
      source: SOURCE.DiffTool,
      changeStatus: CHANGE_STATUS.Unstaged,
      linkedEntityGroupId: null,
    });
    expect(cache.isEmpty()).toBe(true);
  });

  it('uses the connection-local generated-ID fallback when TypeORM returns no identifier', async () => {
    const manager = makeManager();
    manager.insert.mockResolvedValue({identifiers: []});
    manager.builder.getRawOne.mockResolvedValue({changeId: 456});
    const writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );

    await expect(
      writer.writeCreate(
        {...TARGET, payload: {alias: 'created'}},
        SESSION_ID,
        manager,
      ),
    ).resolves.toBe(456);

    expect(manager.builder.select).toHaveBeenCalledWith(
      'last_insert_rowid()',
      'changeId',
    );
  });

  it('keeps cached intents when target loading fails', async () => {
    const cache = new PendingChangeCache();
    const queryService = makeQueryService();
    queryService.getAllByTargetKeys.mockRejectedValue(new Error('forced'));
    const writer = new PendingChangeWriter(queryService, cache);
    const manager = makeManager();

    await writer.writeDelta(
      {...TARGET, delta: {alias: 'cached'}, fieldGroup: 'alias', cache: true},
      SESSION_ID,
      manager,
    );
    await expect(writer.flushCachedActions(manager)).rejects.toThrow('forced');
    expect(cache.size()).toBe(1);
  });

  it('rejects explicit status for MANUAL writes', async () => {
    const writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );
    await expect(
      writer.writeDelta(
        {
          ...TARGET,
          delta: {alias: 'new'},
          fieldGroup: 'alias',
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Unstaged,
        },
        SESSION_ID,
        makeManager(),
      ),
    ).rejects.toThrow('MANUAL source does not accept an explicit changeStatus');
  });
});
