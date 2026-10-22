/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {ReducedEditAction} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';
import {TypeOrmApplyChangesService} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-apply-changes.service.js';

const stagedRows: EditActionRow[] = [
  {
    changeId: 4,
    sessionId: 9,
    aggregateId: 20,
    targetSystemId: 30,
    targetTable: ENTITY_NAMES.SpfModule,
    operation: CHANGE_OPERATION.Update,
    fieldPath: null,
    newValue: {alias: 'updated'},
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    linkedEntityGroupId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

const reduced: ReducedEditAction[] = [
  {
    tableName: ENTITY_NAMES.SpfModule,
    operation: CHANGE_OPERATION.Update,
    targetSystemId: 30,
    values: {alias: 'updated'},
    sourceEditActionIds: [4],
  },
];

describe('TypeOrmApplyChangesService', () => {
  it('applies selected rows and deletes their exact IDs', async () => {
    const query = jest.fn(async () => stagedRows);
    const reduce = jest.fn(async () => reduced);
    const execute = jest.fn(async () => undefined);
    const deleteStagedEditActionsByIds = jest.fn(async () => 1);
    const countStagedChangesForSession = jest.fn(async () => 0);
    const service = new TypeOrmApplyChangesService(
      {session: {sessionId: 9}} as never,
      {} as EntityManager,
      {query},
      {reduce},
      {
        deleteStagedEditActionsByIds,
        countStagedChangesForSession,
      },
      execute,
    );

    await expect(service.apply()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith({
      sessionId: 9,
      changeStatus: CHANGE_STATUS.Staged,
    });
    expect(execute).toHaveBeenCalledWith({}, reduced);
    expect(deleteStagedEditActionsByIds).toHaveBeenCalledWith(9, [4]);
  });

  it('rejects an empty staged selection without attempting cleanup', async () => {
    const deleteStagedEditActionsByIds = jest.fn();
    const service = new TypeOrmApplyChangesService(
      {session: {sessionId: 9}} as never,
      {} as EntityManager,
      {query: async () => []},
      {reduce: async () => []},
      {
        deleteStagedEditActionsByIds,
        countStagedChangesForSession: jest.fn(),
      },
      jest.fn(),
    );

    await expect(service.apply()).rejects.toMatchObject({
      errorCode: 'NO_STAGED_CHANGES',
    });
    expect(deleteStagedEditActionsByIds).not.toHaveBeenCalled();
  });

  it('fails when cleanup does not delete the complete selected set', async () => {
    const service = new TypeOrmApplyChangesService(
      {session: {sessionId: 9}} as never,
      {} as EntityManager,
      {query: async () => stagedRows},
      {reduce: async () => reduced},
      {
        deleteStagedEditActionsByIds: async () => 0,
        countStagedChangesForSession: async () => 0,
      },
      async () => undefined,
    );

    await expect(service.apply()).rejects.toThrow(
      'Expected to delete 1 staged edit action(s), deleted 0',
    );
  });
});
