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
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  FAILED_ENTITY_REASON,
  SOURCE,
} from '@arc/core';
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

describe('DbKeyValueDefQueryService Integration Tests', () => {
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
      dataSource.manager,
      new EditActionsQueryService(dataSource.manager),
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(
    projectName = 'Test Project',
  ): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      name: projectName,
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

    const result = await service.findAllKeyDefinitions(fileSystemId);

    expect(result).toEqual([]);
  });

  it('returns key definitions with their embedded values', async () => {
    const {fileSystemId} = await createFileDependency();

    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'MyKey',
    });
    await valueDefinitionRepository.save({
      systemId: 2,
      keySystemId: key.systemId,
      naturalId: 200,
      name: 'MyValue',
    });

    const result = await service.findAllKeyDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      systemId: 1,
      naturalId: 100,
      name: 'MyKey',
    });
    expect(result[0].values).toHaveLength(1);
    expect(result[0].values[0]).toMatchObject({
      systemId: 2,
      naturalId: 200,
      name: 'MyValue',
    });
  });

  it('filters by keyId when provided', async () => {
    const {fileSystemId} = await createFileDependency();

    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'KeyOne',
    });
    await keyDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      naturalId: 200,
      name: 'KeyTwo',
    });

    const result = await service.findAllKeyDefinitions(fileSystemId, {
      naturalId: 200,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('KeyTwo');
  });

  it('returns an empty array when the keyId filter matches nothing', async () => {
    const {fileSystemId} = await createFileDependency();
    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'KeyOne',
    });

    const result = await service.findAllKeyDefinitions(fileSystemId, {
      naturalId: 999,
    });

    expect(result).toEqual([]);
  });

  it('reflects a session UPDATE on a key definition', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
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
      linkedEntityGroupId: null,
    });

    const result = await service.findAllKeyDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('UpdatedName');
  });

  it('excludes a key definition deleted in the session', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
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
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const result = await service.findAllKeyDefinitions(fileSystemId);

    expect(result).toEqual([]);
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
        naturalId: 900,
        name: 'SessionOnlyKey',
      },
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const result = await service.findAllKeyDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      systemId: 999,
      name: 'SessionOnlyKey',
    });
    expect(result[0].values).toEqual([]);
  });

  it('rejects when the underlying value query throws', async () => {
    const {fileSystemId} = await createFileDependency();

    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
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
      await expect(service.findAllKeyDefinitions(fileSystemId)).rejects.toThrow(
        'Simulated DB failure',
      );
    } finally {
      spy.mockRestore();
    }
  });

  async function seedKeyWithValues(fileSystemId: number): Promise<void> {
    await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'Speaker',
    });
    await valueDefinitionRepository.save([
      {systemId: 11, keySystemId: 1, naturalId: 1, name: 'Left'},
      {systemId: 12, keySystemId: 1, naturalId: 2, name: 'Right'},
    ]);
  }

  describe('findKeyDefinitions', () => {
    it('returns the requested keys and reports missing ones as not found', async () => {
      const {fileSystemId} = await createFileDependency();
      await seedKeyWithValues(fileSystemId);

      const result = await service.findKeyDefinitions(fileSystemId, [1, 2]);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({systemId: 1, name: 'Speaker'});
      expect(result.items[0].values.map(v => v.name)).toEqual([
        'Left',
        'Right',
      ]);
      expect(result.failed).toEqual([
        {systemId: 2, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });

    it('returns each key once when an id is requested twice', async () => {
      const {fileSystemId} = await createFileDependency();
      await seedKeyWithValues(fileSystemId);

      const result = await service.findKeyDefinitions(fileSystemId, [1, 1]);

      expect(result.items.map(k => k.systemId)).toEqual([1]);
      expect(result.failed).toEqual([]);
    });

    it('does not return a key that belongs to another file', async () => {
      const {fileSystemId} = await createFileDependency();
      const other = await createFileDependency('Other Project');
      await seedKeyWithValues(other.fileSystemId);

      const result = await service.findKeyDefinitions(fileSystemId, [1]);

      expect(result.items).toEqual([]);
      expect(result.failed).toEqual([
        {systemId: 1, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });

    it('returns an empty read for an empty id list', async () => {
      const {fileSystemId} = await createFileDependency();

      await expect(
        service.findKeyDefinitions(fileSystemId, []),
      ).resolves.toEqual({items: [], failed: []});
    });
  });

  describe('findKeyValuePairs', () => {
    it('pairs each requested value with its key and reports missing values', async () => {
      const {fileSystemId} = await createFileDependency();
      await seedKeyWithValues(fileSystemId);

      const result = await service.findKeyValuePairs(fileSystemId, [12, 99]);

      expect(result.items).toEqual([
        {
          key: expect.objectContaining({
            systemId: 1,
            naturalId: 100,
            name: 'Speaker',
          }),
          value: expect.objectContaining({
            systemId: 12,
            naturalId: 2,
            name: 'Right',
          }),
        },
      ]);
      expect(result.failed).toEqual([
        {systemId: 99, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });

    it('includes a value that exists only as a session CREATE', async () => {
      const {fileSystemId} = await createFileDependency();
      await seedKeyWithValues(fileSystemId);
      const session = await createSession(fileSystemId);
      await editActionRepository.save({
        targetSystemId: 13,
        aggregateId: 1,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ValueDefinition,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {systemId: 13, keySystemId: 1, naturalId: 3, name: 'Center'},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      });

      const result = await service.findKeyValuePairs(fileSystemId, [13]);

      expect(result.failed).toEqual([]);
      expect(result.items).toEqual([
        {
          key: expect.objectContaining({systemId: 1, name: 'Speaker'}),
          value: expect.objectContaining({systemId: 13, name: 'Center'}),
        },
      ]);
    });

    it('reports a value as not found when its key was deleted in the session', async () => {
      const {fileSystemId} = await createFileDependency();
      await seedKeyWithValues(fileSystemId);
      const session = await createSession(fileSystemId);
      await editActionRepository.save({
        targetSystemId: 1,
        aggregateId: 1,
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.KeyDefinition,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: '$',
        newValue: {},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      });

      const result = await service.findKeyValuePairs(fileSystemId, [11]);

      expect(result.items).toEqual([]);
      expect(result.failed).toEqual([
        {systemId: 11, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });
  });
});
