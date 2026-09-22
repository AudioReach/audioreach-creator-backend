/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  SOURCE,
  type DomainRuleViolationException,
} from '@arc/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import type {DataSource, QueryRunner} from 'typeorm';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  SESSION_MODE,
  SESSION_STATUS,
  ProjectSessionSchema,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeCache} from '../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {PendingChangeWriter} from '../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

const FILE_ID = 100;
const USECASE_ID = 200;
const VALUE_DEF_ID = 300;
const FIELD_PATH = `$key:valueDefSystemId=${VALUE_DEF_ID}`;

describe('PendingChangeWriter apply contract', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let sessionId: number;
  let cache: PendingChangeCache;
  let writer: PendingChangeWriter;

  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);

  beforeEach(async () => {
    await setupEachTest();
    dataSource = getTestDataSource();
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
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: FILE_ID,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    sessionId = session.sessionId;
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    cache = new PendingChangeCache();
    writer = new PendingChangeWriter(
      new EditActionsQueryService(queryRunner.manager),
      cache,
    );
  });

  it('stores a composite create in its canonical key slot', async () => {
    const spec = {
      targetTable: ENTITY_NAMES.UsecaseGkvValues,
      targetSystemId: USECASE_ID,
      aggregateId: USECASE_ID,
      fieldPath: FIELD_PATH,
      payload: {
        usecaseSystemId: USECASE_ID,
        valueDefSystemId: VALUE_DEF_ID,
      },
      source: SOURCE.Manual,
    } as const;

    await writer.writeCreate(spec, sessionId, 'group-1', queryRunner.manager);

    const [row] = await dataSource.query<
      Array<{
        target_system_id: number;
        field_path: string;
        new_value: string;
      }>
    >(
      'SELECT target_system_id, field_path, new_value FROM edit_actions WHERE session_id = ?',
      [sessionId],
    );
    expect(row.target_system_id).toBe(USECASE_ID);
    expect(row.field_path).toBe(FIELD_PATH);
    expect(JSON.parse(row.new_value)).toEqual(spec.payload);
  });

  it('rejects a composite update before superseding its current row', async () => {
    await dataSource.query(
      `INSERT INTO edit_actions
        (session_id, aggregate_id, target_system_id, target_table, operation,
         field_path, new_value, source, change_status, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STAGED', ?)`,
      [
        sessionId,
        USECASE_ID,
        USECASE_ID,
        ENTITY_NAMES.UsecaseGkvValues,
        CHANGE_OPERATION.Create,
        FIELD_PATH,
        JSON.stringify({
          usecaseSystemId: USECASE_ID,
          valueDefSystemId: VALUE_DEF_ID,
        }),
        SOURCE.Manual,
        'group-1',
      ],
    );

    await expect(
      writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.UsecaseGkvValues,
          targetSystemId: USECASE_ID,
          aggregateId: USECASE_ID,
          fieldGroup: FIELD_PATH,
          delta: {
            usecaseSystemId: USECASE_ID,
            valueDefSystemId: VALUE_DEF_ID,
          },
        },
        sessionId,
        'group-1',
        queryRunner.manager,
      ),
    ).rejects.toMatchObject<DomainRuleViolationException>({
      errorCode: 'DOMAIN_RULE_VIOLATION',
    });

    const rows = await dataSource.query<
      Array<{valid_until: string | null}>
    >('SELECT valid_until FROM edit_actions WHERE session_id = ?', [sessionId]);
    expect(rows).toEqual([{valid_until: null}]);
    expect(cache.isEmpty()).toBe(true);
  });

  it('flushes a cached composite delete without querying a systemId version', async () => {
    const spec = {
      targetTable: ENTITY_NAMES.UsecaseGkvValues,
      targetSystemId: USECASE_ID,
      aggregateId: USECASE_ID,
      fieldPath: FIELD_PATH,
      payload: {
        usecaseSystemId: USECASE_ID,
        valueDefSystemId: VALUE_DEF_ID,
      },
      cache: true,
      source: SOURCE.Manual,
    } as const;

    await writer.writeDelete(spec, sessionId, 'group-1', queryRunner.manager);
    await expect(cache.flush(queryRunner)).resolves.toBeUndefined();

    const [row] = await dataSource.query<
      Array<{field_path: string; new_value: string}>
    >(
      'SELECT field_path, new_value FROM edit_actions WHERE session_id = ?',
      [sessionId],
    );
    expect(row.field_path).toBe(FIELD_PATH);
    expect(JSON.parse(row.new_value)).toEqual(spec.payload);
  });
});
