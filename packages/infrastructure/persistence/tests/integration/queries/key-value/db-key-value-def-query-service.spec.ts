/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from '@jest/globals';
import {Repository} from 'typeorm';
import {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {CHANGE_OPERATION, CHANGE_STATUS, RESULT_KIND, SOURCE} from '@arc/core';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  KeyDefinitionSchema,
  KeyDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {
  ValueDefinitionSchema,
  ValueDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  EditActionSchema,
  EditActionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

describe('DbKeyValueDefQueryService.getAllKeyDefinitions Integration Tests', () => {
  let dataSource: DataSource;
  let keyDefinitionRepository: Repository<KeyDefinitionRow>;
  let valueDefinitionRepository: Repository<ValueDefinitionRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbKeyValueDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    keyDefinitionRepository =
      getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueDefinitionRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbKeyValueDefQueryService(
      dataSource,
      new EditActionsQueryService(dataSource.manager),
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });

    const file = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });

    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepository.save({
      fileSystemId,
      userId: 'test-user-123',
      clientId: 'test-client-456',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  it('returns an empty array when the file has no key definitions', async () => {
    const {fileSystemId} = await createFileDependency();

    const result = await service.getAllKeyDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([]);
  });

  it('returns key definitions with their embedded values', async () => {
    const {fileSystemId} = await createFileDependency();

    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'MyKey',
    });
    await valueDefinitionRepository.save({
      systemId: 2,
      keySystemId: key.systemId,
      valueId: 200,
      name: 'MyValue',
    });

    const result = await service.getAllKeyDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: 1,
      keyId: 100,
      name: 'MyKey',
    });
    expect(result.data[0].values).toHaveLength(1);
    expect(result.data[0].values[0]).toMatchObject({
      systemId: 2,
      valueId: 200,
      name: 'MyValue',
    });
  });

  it('filters by keyId when provided', async () => {
    const {fileSystemId} = await createFileDependency();

    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'KeyOne',
    });
    await keyDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      keyId: 200,
      name: 'KeyTwo',
    });

    const result = await service.getAllKeyDefinitions(fileSystemId, 200);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('KeyTwo');
  });

  it('returns an empty array when the keyId filter matches nothing', async () => {
    const {fileSystemId} = await createFileDependency();
    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'KeyOne',
    });

    const result = await service.getAllKeyDefinitions(fileSystemId, 999);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([]);
  });

  it('reflects a session UPDATE on a key definition', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'OriginalName',
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      targetSystemId: key.systemId,
      aggregateId: key.systemId,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {name: 'UpdatedName'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });

    const result = await service.getAllKeyDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('UpdatedName');
  });

  it('excludes a key definition deleted in the session', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'ToBeDeleted',
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      targetSystemId: key.systemId,
      aggregateId: key.systemId,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: '$',
      newValue: null,
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });

    const result = await service.getAllKeyDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([]);
  });

  it('includes a key definition that exists only as a session CREATE', async () => {
    const {fileSystemId} = await createFileDependency();
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      targetSystemId: 999,
      aggregateId: 999,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {
        systemId: 999,
        fileSystemId,
        keyId: 900,
        name: 'SessionOnlyKey',
      },
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });

    const result = await service.getAllKeyDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: 999,
      name: 'SessionOnlyKey',
    });
    expect(result.data[0].values).toEqual([]);
  });

  it('returns Result.fail when the underlying value query throws', async () => {
    const {fileSystemId} = await createFileDependency();

    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'SomeKey',
    });

    // The KeyValueDefinitionFetcher uses manager.getRepository (EntityManager),
    // so the spy must target dataSource.manager rather than dataSource itself.
    const realGetRepository = dataSource.manager.getRepository.bind(
      dataSource.manager,
    );
    const spy = jest
      .spyOn(dataSource.manager, 'getRepository')
      .mockImplementation((entity: string) => {
        if (entity === ENTITY_NAMES.ValueDefinition) {
          throw new Error('Simulated DB failure');
        }
        return realGetRepository(entity);
      });

    try {
      const result = await service.getAllKeyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind !== RESULT_KIND.Fail) return;
      expect(result.issues[0].message).toContain('Simulated DB failure');
    } finally {
      spy.mockRestore();
    }
  });
});
