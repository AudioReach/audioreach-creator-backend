/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, Repository} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {ProcessorDefinitionFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/definitions/common/processor-definition-fetcher.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProcessorDefinitionSchema,
  ProcessorDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/common/processor-definition.schema.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;

describe('ProcessorDefinitionFetcher (integration)', () => {
  let dataSource: DataSource;
  let processorRepository: Repository<ProcessorDefinitionRow>;
  let fetcher: ProcessorDefinitionFetcher;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    processorRepository = getTestRepository<ProcessorDefinitionRow>(
      ProcessorDefinitionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    await getTestRepository(ProjectSchema).save({
      systemId: 1,
      name: 'Test Project',
      description: '',
      type: 'Offline',
    });
    await getTestRepository(ArcDbFileSchema).save({
      systemId: FILE_ID,
      projectSystemId: 1,
      fileName: 'test.acdb',
      description: '',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    fetcher = new ProcessorDefinitionFetcher(
      dataSource.manager,
      new EditActionsQueryService(dataSource.manager),
    );
  });

  async function createSession(): Promise<number> {
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: FILE_ID,
      userId: 'test-user',
      clientId: 'test-client',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    return session.sessionId;
  }

  async function saveProcessor(
    systemId: number,
    processorDefinitionId: number,
    name: string,
  ): Promise<void> {
    await processorRepository.save({
      systemId,
      processorDefinitionId,
      name,
      fileSystemId: FILE_ID,
    });
  }

  async function saveAction(options: {
    sessionId: number;
    targetSystemId: number;
    operation: string;
    newValue: unknown;
    fieldPath?: string | null;
    createdAt?: Date;
  }): Promise<void> {
    await getTestRepository(EditActionSchema).save({
      sessionId: options.sessionId,
      aggregateId: options.targetSystemId,
      targetSystemId: options.targetSystemId,
      targetTable: ENTITY_NAMES.ProcessorDefinition,
      operation: options.operation,
      fieldPath: options.fieldPath ?? null,
      newValue: options.newValue,
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
      ...(options.createdAt ? {createdAt: options.createdAt} : {}),
    });
  }

  it('returns an empty array for an empty ID scope', async () => {
    await expect(fetcher.fetchMany([], null)).resolves.toEqual([]);
  });

  it('applies scalar and recursive OR filters to baseline rows', async () => {
    await saveProcessor(1, 10, 'Audio');
    await saveProcessor(2, 20, 'Video');
    await saveProcessor(3, 30, 'Other');

    const rows = await fetcher.fetchMany([1, 2, 3], null, {
      fileSystemId: FILE_ID,
      $or: [{name: 'Audio'}, {name: 'Video'}],
    });

    expect(rows.map(row => row.systemId)).toEqual([1, 2]);
  });

  it('returns one processor through the fetchMany path', async () => {
    await saveProcessor(1, 10, 'Audio');

    await expect(fetcher.fetchOne(1, null)).resolves.toMatchObject({
      systemId: 1,
      name: 'Audio',
    });
    await expect(fetcher.fetchOne(999, null)).resolves.toBeNull();
  });

  it('returns a session-created processor and applies its filters', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Create,
      newValue: {
        processorDefinitionId: 10,
        name: 'Created',
        fileSystemId: FILE_ID,
      },
    });

    const rows = await fetcher.fetchMany([10], sessionId, {
      name: 'Created',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({systemId: 10, name: 'Created'});
  });

  it('composes CREATE and UPDATE actions for a session-created processor', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Create,
      newValue: {
        processorDefinitionId: 10,
        name: 'Created',
        fileSystemId: FILE_ID,
      },
      fieldPath: '$',
      createdAt: new Date(1000),
    });
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Update,
      newValue: {name: 'Updated'},
      createdAt: new Date(2000),
    });

    await expect(fetcher.fetchOne(10, sessionId)).resolves.toMatchObject({
      systemId: 10,
      name: 'Updated',
    });
  });

  it('returns null when a processor is deleted in the session', async () => {
    await saveProcessor(1, 10, 'Audio');
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 1,
      operation: CHANGE_OPERATION.Delete,
      newValue: {},
    });

    await expect(fetcher.fetchOne(1, sessionId)).resolves.toBeNull();
  });
});
