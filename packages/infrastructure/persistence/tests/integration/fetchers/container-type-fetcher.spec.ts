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
import {ContainerTypeFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/definitions/container/container-type-fetcher.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ContainerTypeSchema,
  ContainerTypeRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-definition.schema.js';
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

describe('ContainerTypeFetcher (integration)', () => {
  let dataSource: DataSource;
  let containerTypeRepository: Repository<ContainerTypeRow>;
  let fetcher: ContainerTypeFetcher;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    containerTypeRepository =
      getTestRepository<ContainerTypeRow>(ContainerTypeSchema);
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
    fetcher = new ContainerTypeFetcher(
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

  async function saveContainerType(
    systemId: number,
    name: string,
    value: number,
  ): Promise<void> {
    await containerTypeRepository.save({systemId, name, value});
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
      targetTable: ENTITY_NAMES.ContainerType,
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
    await saveContainerType(1, 'Input', 1);
    await saveContainerType(2, 'Output', 2);
    await saveContainerType(3, 'Other', 3);

    const rows = await fetcher.fetchMany([1, 2, 3], null, {
      $or: [{name: 'Input'}, {value: 2}],
    });

    expect(rows.map(row => row.systemId)).toEqual([1, 2]);
  });

  it('returns one container type through the fetchMany path', async () => {
    await saveContainerType(1, 'Input', 1);

    await expect(fetcher.fetchOne(1, null)).resolves.toMatchObject({
      systemId: 1,
      name: 'Input',
    });
    await expect(fetcher.fetchOne(999, null)).resolves.toBeNull();
  });

  it('returns a session-created container type and applies its filters', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Create,
      newValue: {name: 'Created', value: 10},
      fieldPath: '$',
    });

    const rows = await fetcher.fetchMany([10], sessionId, {
      name: 'Created',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({systemId: 10, name: 'Created'});
  });

  it('composes CREATE and UPDATE actions for a session-created container type', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Create,
      newValue: {name: 'Created', value: 10},
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
      value: 10,
    });
  });

  it('returns null when a container type is deleted in the session', async () => {
    await saveContainerType(1, 'Input', 1);
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
