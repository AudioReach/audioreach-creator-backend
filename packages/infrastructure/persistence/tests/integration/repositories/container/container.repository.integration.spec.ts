/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmContainerRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/container/container.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {Container} from '@arc/core';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';

const FILE_ID = 100;
const CONTAINER_ID = 42;

async function seedProjectAndFile(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'f.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
}

async function seedSession(ds: DataSource): Promise<number> {
  const row = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return row.sessionId;
}

async function seedContainer(
  ds: DataSource,
  opts: {
    systemId: number;
    fileSystemId: number;
    containerTypeSystemId?: number;
  },
) {
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, 1, ?, ?)`,
    [opts.systemId, opts.containerTypeSystemId ?? 5, opts.fileSystemId],
  );
}

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}

function makeUow(sessionId: number) {
  return {
    getWriteContext: () => ({
      session: {
        sessionId,
        fileSystemId: FILE_ID,
        mode: SESSION_MODE.Designer,
        projectId: '1',
      },
      groupId: 'test-group',
    }),
  } as any;
}

function makeRepo(
  qr: QueryRunner,
  sessionId: number,
): TypeOrmContainerRepository {
  return new TypeOrmContainerRepository(
    makeWriter(qr.manager),
    qr.manager,
    makeUow(sessionId),
  );
}

describe('TypeOrmContainerRepository (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  it('containerExists returns false for unknown systemId', async () => {
    const sessionId = await seedSession(ds);
    const repo = makeRepo(qr, sessionId);
    expect(await repo.containerExists(9999, FILE_ID)).toBe(false);
  });

  it('containerExists returns true for known systemId', async () => {
    await seedContainer(ds, {systemId: CONTAINER_ID, fileSystemId: FILE_ID});
    const sessionId = await seedSession(ds);
    const repo = makeRepo(qr, sessionId);
    expect(await repo.containerExists(CONTAINER_ID, FILE_ID)).toBe(true);
  });

  it('getContainerById returns null for unknown systemId', async () => {
    const sessionId = await seedSession(ds);
    const repo = makeRepo(qr, sessionId);
    expect(await repo.getContainerById(9999, FILE_ID)).toBeNull();
  });

  it('getContainerById returns Container with correct fields', async () => {
    await seedContainer(ds, {
      systemId: CONTAINER_ID,
      fileSystemId: FILE_ID,
      containerTypeSystemId: 7,
    });
    const sessionId = await seedSession(ds);
    const repo = makeRepo(qr, sessionId);
    const container = await repo.getContainerById(CONTAINER_ID, FILE_ID);
    expect(container).not.toBeNull();
    expect(container!.systemId).toBe(CONTAINER_ID);
    expect(container!.containerTypeSystemId).toBe(7);
  });

  it('createContainer writes a CREATE edit_action row', async () => {
    const sessionId = await seedSession(ds);
    await qr.startTransaction();
    const repo = makeRepo(qr, sessionId);
    const container = new Container(50, 2, 7, FILE_ID);
    await repo.createContainer(container);
    await qr.commitTransaction();
    const rows: any[] = await ds.query(
      `SELECT * FROM edit_actions WHERE session_id = ? AND target_table = ? AND operation = ?`,
      [sessionId, ENTITY_NAMES.Container, CHANGE_OPERATION.Create],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].target_system_id).toBe(50);
  });
});
