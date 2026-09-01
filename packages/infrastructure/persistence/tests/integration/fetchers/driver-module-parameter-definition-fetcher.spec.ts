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
import {DriverModuleParameterDefinitionFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/definitions/driver-module-definitions/driver-module-parameter-definition-fetcher.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  DriverModuleDefinitionSchema,
  DriverModuleDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import {
  DriverModuleParameterDefinitionSchema,
  DriverModuleParameterDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
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
const DEFINITION_ID = 1;

describe('DriverModuleParameterDefinitionFetcher (integration)', () => {
  let dataSource: DataSource;
  let definitionRepository: Repository<DriverModuleDefinitionRow>;
  let parameterRepository: Repository<DriverModuleParameterDefinitionRow>;
  let fetcher: DriverModuleParameterDefinitionFetcher;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    definitionRepository = getTestRepository<DriverModuleDefinitionRow>(
      DriverModuleDefinitionSchema,
    );
    parameterRepository = getTestRepository<DriverModuleParameterDefinitionRow>(
      DriverModuleParameterDefinitionSchema,
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
    await definitionRepository.save({
      systemId: DEFINITION_ID,
      fileSystemId: FILE_ID,
      moduleDefinitionId: 1,
      name: 'Driver Module',
    });
    fetcher = new DriverModuleParameterDefinitionFetcher(
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

  async function saveParameter(
    systemId: number,
    parameterId: number,
    name: string,
  ): Promise<void> {
    await parameterRepository.save({
      systemId,
      parameterId,
      name,
      description: `${name} description`,
      maxSize: 4,
      paramStructure: '[]',
      driverModuleDefinitionSystemId: DEFINITION_ID,
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
      aggregateId: DEFINITION_ID,
      targetSystemId: options.targetSystemId,
      targetTable: ENTITY_NAMES.DriverModuleParameterDefinition,
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

  it('returns an empty array for an empty definition scope', async () => {
    await expect(fetcher.fetchMany([], null)).resolves.toEqual([]);
  });

  it('applies scalar and recursive OR filters to child rows', async () => {
    await saveParameter(10, 10, 'Input');
    await saveParameter(11, 11, 'Output');
    await saveParameter(12, 12, 'Other');

    const rows = await fetcher.fetchMany([DEFINITION_ID], null, {
      $or: [{name: 'Input'}, {parameterId: 11}],
    });

    expect(rows.map(row => row.systemId)).toEqual([10, 11]);
  });

  it('returns one parameter through the fetchMany path', async () => {
    await saveParameter(10, 10, 'Input');

    await expect(
      fetcher.fetchOne(10, DEFINITION_ID, null),
    ).resolves.toMatchObject({systemId: 10, name: 'Input'});
    await expect(
      fetcher.fetchOne(999, DEFINITION_ID, null),
    ).resolves.toBeNull();
  });

  it('returns a session-created parameter and applies its filters', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 20,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {
        parameterId: 20,
        name: 'Created',
        description: 'Created description',
        maxSize: 4,
        paramStructure: '[]',
        driverModuleDefinitionSystemId: DEFINITION_ID,
      },
    });

    const rows = await fetcher.fetchMany([DEFINITION_ID], sessionId, {
      name: 'Created',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({systemId: 20, name: 'Created'});
  });

  it('composes CREATE and UPDATE actions for a session-created parameter', async () => {
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 20,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {
        parameterId: 20,
        name: 'Created',
        description: 'Created description',
        maxSize: 4,
        paramStructure: '[]',
        driverModuleDefinitionSystemId: DEFINITION_ID,
      },
      createdAt: new Date(1000),
    });
    await saveAction({
      sessionId,
      targetSystemId: 20,
      operation: CHANGE_OPERATION.Update,
      newValue: {name: 'Updated'},
      createdAt: new Date(2000),
    });

    await expect(
      fetcher.fetchOne(20, DEFINITION_ID, sessionId),
    ).resolves.toMatchObject({systemId: 20, name: 'Updated'});
  });

  it('returns null when a parameter is deleted in the session', async () => {
    await saveParameter(10, 10, 'Input');
    const sessionId = await createSession();
    await saveAction({
      sessionId,
      targetSystemId: 10,
      operation: CHANGE_OPERATION.Delete,
      newValue: {},
    });

    await expect(
      fetcher.fetchOne(10, DEFINITION_ID, sessionId),
    ).resolves.toBeNull();
  });
});
