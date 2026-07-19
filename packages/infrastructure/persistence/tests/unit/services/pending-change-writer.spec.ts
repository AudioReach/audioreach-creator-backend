/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {PendingChangeWriter} from '../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {SESSION_MODE} from '@arc/core';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {QueryRunner} from 'typeorm';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION_ID = 1;
const GROUP_ID = 'grp-uuid-1';

function makeQueryRunner(selectImpl?: (sql: string) => unknown[]): QueryRunner {
  return {
    query: jest.fn(async (sql: string) => {
      if (selectImpl && sql.startsWith('SELECT')) return selectImpl(sql);
      return [];
    }),
    manager: {query: jest.fn()},
  } as unknown as QueryRunner;
}

function makeQueryService(
  existingRow: EditActionRow | null = null,
): jest.Mocked<EditActionsQueryService> {
  return {
    findCurrentRow: jest.fn().mockResolvedValue(existingRow),
    getByAggregateId: jest.fn().mockResolvedValue([]),
    getByAggregateAndTable: jest.fn().mockResolvedValue([]),
    getByTable: jest.fn().mockResolvedValue([]),
    getBySource: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<EditActionsQueryService>;
}

function getInsertParams(qr: QueryRunner): unknown[] | undefined {
  const calls = (qr.query as jest.Mock).mock.calls as unknown[][];
  const call = calls.find(
    ([sql]) =>
      typeof sql === 'string' &&
      (sql as string).startsWith('INSERT INTO edit_actions'),
  );
  return call?.[1] as unknown[] | undefined;
}

// Column indices in INSERT INTO edit_actions (...) VALUES ($1...$11):
// 0=session_id 1=aggregate_id 2=target_system_id 3=target_table
// 4=operation 5=field_path 6=new_value 7=source 8=change_status 9=group_id 10=linked_entity_group_id
const COL = {
  operation: 4,
  fieldPath: 5,
  newValue: 6,
  source: 7,
  changeStatus: 8,
} as const;

// ── changeStatus determination (spec §9.6) ────────────────────────────────────

describe('PendingChangeWriter — changeStatus determination', () => {
  let writer: PendingChangeWriter;

  beforeEach(() => {
    writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );
  });

  it('MANUAL always resolves to STAGED', async () => {
    const qr = makeQueryRunner();
    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 1,
        aggregateId: 10,
        delta: {alias: 'x'},
        fieldGroup: 'alias',
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.changeStatus]).toBe(CHANGE_STATUS.Staged);
  });

  it('MANUAL with explicit changeStatus throws', async () => {
    const qr = makeQueryRunner();
    await expect(
      writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SpfModule,
          targetSystemId: 1,
          aggregateId: 10,
          delta: {alias: 'x'},
          fieldGroup: 'alias',
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Unstaged,
        },
        SESSION_ID,
        GROUP_ID,
        qr,
      ),
    ).rejects.toThrow('MANUAL source does not accept an explicit changeStatus');
  });

  it('DIFF_TOOL without override defaults to UNSTAGED', async () => {
    const qr = makeQueryRunner();
    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 2,
        aggregateId: 10,
        delta: {alias: 'x'},
        fieldGroup: 'alias',
        source: SOURCE.DiffTool,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.changeStatus]).toBe(
      CHANGE_STATUS.Unstaged,
    );
  });

  it('DIFF_TOOL with STAGED override uses STAGED', async () => {
    const qr = makeQueryRunner();
    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 3,
        aggregateId: 10,
        delta: {alias: 'x'},
        fieldGroup: 'alias',
        source: SOURCE.DiffTool,
        changeStatus: CHANGE_STATUS.Staged,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.changeStatus]).toBe(CHANGE_STATUS.Staged);
  });

  it('AUTO_ROUTING always resolves to UNSTAGED', async () => {
    const qr = makeQueryRunner();
    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 4,
        aggregateId: 10,
        delta: {alias: 'x'},
        fieldGroup: 'alias',
        source: SOURCE.AutoRouting,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.changeStatus]).toBe(
      CHANGE_STATUS.Unstaged,
    );
  });

  it('AUTO_ROUTING with explicit changeStatus throws', async () => {
    const qr = makeQueryRunner();
    await expect(
      writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SpfModule,
          targetSystemId: 4,
          aggregateId: 10,
          delta: {alias: 'x'},
          fieldGroup: 'alias',
          source: SOURCE.AutoRouting,
          changeStatus: CHANGE_STATUS.Staged,
        },
        SESSION_ID,
        GROUP_ID,
        qr,
      ),
    ).rejects.toThrow(
      'AUTO_ROUTING source does not accept an explicit changeStatus',
    );
  });

  it('cache=true + fieldGroup=null throws', async () => {
    const qr = makeQueryRunner();
    await expect(
      writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.SpfModule,
          targetSystemId: 5,
          aggregateId: 10,
          delta: {alias: 'x'},
          source: SOURCE.Manual,
          cache: true,
        },
        SESSION_ID,
        GROUP_ID,
        qr,
      ),
    ).rejects.toThrow('cache=true is invalid for accumulator writes');
  });
});

// ── writeDelta accumulator mode (spec §9.2) ───────────────────────────────────

describe('PendingChangeWriter — writeDelta accumulator mode', () => {
  it('merges new delta keys with existing payload when a prior accumulator row exists', async () => {
    const existing = {
      newValue: {alias: 'old', instanceId: 5},
      targetSystemId: 100,
      fieldPath: null,
    } as unknown as EditActionRow;
    const writer = new PendingChangeWriter(
      makeQueryService(existing),
      new PendingChangeCache(),
    );
    const qr = makeQueryRunner();

    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 100,
        aggregateId: 10,
        delta: {alias: 'new', description: 'added'},
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );

    expect(
      (qr.query as jest.Mock).mock.calls.some(
        ([sql]: unknown[]) =>
          typeof sql === 'string' && (sql as string).startsWith('UPDATE'),
      ),
    ).toBe(true);
    const payload = JSON.parse(
      getInsertParams(qr)![COL.newValue] as string,
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      alias: 'new',
      instanceId: 5,
      description: 'added',
    });
  });

  it('captures baseVersion and inserts on first write (no existing row)', async () => {
    const writer = new PendingChangeWriter(
      makeQueryService(null),
      new PendingChangeCache(),
    );
    const qr = makeQueryRunner(sql =>
      sql.startsWith('SELECT version') ? [{version: 3}] : [],
    );

    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 200,
        aggregateId: 10,
        delta: {alias: 'fresh'},
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );

    const calls = (qr.query as jest.Mock).mock.calls as unknown[][];
    const versionInsert = calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        (sql as string).startsWith(
          'INSERT OR IGNORE INTO session_entity_versions',
        ),
    );
    expect(versionInsert).toBeDefined();
    expect((versionInsert![1] as unknown[])[2]).toBe(3);
  });
});

// ── writeDelta per-slot mode (spec §9.3) ─────────────────────────────────────

describe('PendingChangeWriter — writeDelta per-slot mode', () => {
  it('supersedes old slot row and inserts new row with exact delta (no merge)', async () => {
    const writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );
    const qr = makeQueryRunner();

    await writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 300,
        aggregateId: 10,
        delta: {alias: 'slot-value'},
        fieldGroup: 'alias',
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );

    expect(
      (qr.query as jest.Mock).mock.calls.some(
        ([sql]: unknown[]) =>
          typeof sql === 'string' && (sql as string).startsWith('UPDATE'),
      ),
    ).toBe(true);
    const params = getInsertParams(qr)!;
    expect(params[COL.fieldPath]).toBe('alias');
    expect(JSON.parse(params[COL.newValue] as string)).toEqual({
      alias: 'slot-value',
    });
  });
});

// ── writeCreate (spec §9.4) ───────────────────────────────────────────────────

describe('PendingChangeWriter — writeCreate', () => {
  let writer: PendingChangeWriter;
  beforeEach(() => {
    writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );
  });

  it('inserts a CREATE row with fieldPath="$" and full payload', async () => {
    const qr = makeQueryRunner();
    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 500,
        aggregateId: 10,
        payload: {alias: 'NewModule', instanceId: 7},
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    const params = getInsertParams(qr)!;
    expect(params[COL.operation]).toBe(CHANGE_OPERATION.Create);
    expect(params[COL.fieldPath]).toBe('$');
    expect(JSON.parse(params[COL.newValue] as string)).toEqual({
      alias: 'NewModule',
      instanceId: 7,
    });
  });

  it('does NOT capture baseVersion (no SELECT or INSERT OR IGNORE)', async () => {
    const qr = makeQueryRunner();
    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 501,
        aggregateId: 10,
        payload: {alias: 'Fresh'},
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    const calls = (qr.query as jest.Mock).mock.calls as unknown[][];
    expect(
      calls.some(
        ([sql]) =>
          typeof sql === 'string' && (sql as string).startsWith('SELECT'),
      ),
    ).toBe(false);
    expect(
      calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          (sql as string).startsWith('INSERT OR IGNORE'),
      ),
    ).toBe(false);
  });

  it('DIFF_TOOL CREATE with STAGED override produces STAGED row', async () => {
    const qr = makeQueryRunner();
    await writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 503,
        aggregateId: 10,
        payload: {alias: 'DiffModule'},
        source: SOURCE.DiffTool,
        changeStatus: CHANGE_STATUS.Staged,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.changeStatus]).toBe(CHANGE_STATUS.Staged);
  });

  it('enqueues to cache when cache=true, no immediate INSERT', async () => {
    const cache = new PendingChangeCache();
    const localWriter = new PendingChangeWriter(makeQueryService(), cache);
    const qr = makeQueryRunner();
    await localWriter.writeCreate(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 502,
        aggregateId: 10,
        payload: {alias: 'Cached'},
        source: SOURCE.Manual,
        cache: true,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(cache.size()).toBe(1);
    expect(getInsertParams(qr)).toBeUndefined();
  });
});

// ── writeDelete (spec §9.2 DELETE sub-case) ───────────────────────────────────

describe('PendingChangeWriter — writeDelete', () => {
  let writer: PendingChangeWriter;
  beforeEach(() => {
    writer = new PendingChangeWriter(
      makeQueryService(),
      new PendingChangeCache(),
    );
  });

  it('inserts a DELETE row with operation=DELETE', async () => {
    const qr = makeQueryRunner(sql =>
      sql.startsWith('SELECT version') ? [{version: 2}] : [],
    );
    await writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 600,
        aggregateId: 10,
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    expect(getInsertParams(qr)?.[COL.operation]).toBe(CHANGE_OPERATION.Delete);
  });

  it('captures baseVersion before inserting the DELETE row', async () => {
    const qr = makeQueryRunner(sql =>
      sql.startsWith('SELECT version') ? [{version: 5}] : [],
    );
    await writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 601,
        aggregateId: 10,
        source: SOURCE.Manual,
      },
      SESSION_ID,
      GROUP_ID,
      qr,
    );
    const calls = (qr.query as jest.Mock).mock.calls as unknown[][];
    const versionInsert = calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        (sql as string).startsWith(
          'INSERT OR IGNORE INTO session_entity_versions',
        ),
    );
    expect(versionInsert).toBeDefined();
    expect((versionInsert![1] as unknown[])[2]).toBe(5);
  });
});
