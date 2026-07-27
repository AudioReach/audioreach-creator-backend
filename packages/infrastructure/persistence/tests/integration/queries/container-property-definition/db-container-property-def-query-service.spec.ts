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
} from '@jest/globals';
import {Repository, DataSource} from 'typeorm';
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
  ERROR_CODES,
  RESULT_KIND,
  SOURCE,
} from '@arc/core';
import {DbContainerPropertyDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ContainerPropertyDefinitionSchema,
  ContainerPropertyRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.js';
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

describe('DbContainerPropertyDefQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let containerPropertyRepository: Repository<ContainerPropertyRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbContainerPropertyDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    containerPropertyRepository = getTestRepository<ContainerPropertyRow>(
      ContainerPropertyDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbContainerPropertyDefQueryService(
      dataSource,
      new EditActionsQueryService(dataSource.manager),
      new TypeOrmSessionRepository(dataSource.manager),
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

  describe('getAllContainerPropertyDefinitions', () => {
    it('returns an empty array when the file has no container property definitions (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns all container property definitions for the file (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
      });
    });

    it('filters by propertyNaturalId when provided', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'FirstProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });
      await containerPropertyRepository.save({
        systemId: 2,
        fileSystemId,
        propertyId: 200,
        name: 'SecondProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result = await service.getAllContainerPropertyDefinitions(
        fileSystemId,
        200,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].propertyId).toBe(200);
    });

    it('returns the same result when a session exists but has no pending changes (Tier 2)', async () => {
      const {fileSystemId} = await createFileDependency();
      await createSession(fileSystemId);

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
    });

    it('reflects a pending UPDATE edit action on name (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerProperty,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'name',
        newValue: {name: 'UpdatedName'},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result =
        await service.getAllContainerPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].name).toBe('UpdatedName');
    });
  });

  describe('getContainerPropertyDefinition', () => {
    it('returns the property definition by systemId (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      const result = await service.getContainerPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.systemId).toBe(1);
      expect(result.data.maxSize).toBe(4);
    });

    it('returns Result.fail with ENTITY_NOT_FOUND when the systemId does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getContainerPropertyDefinition(
        999,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind !== RESULT_KIND.Fail) return;
      expect(result.issues[0].code).toBe(ERROR_CODES.ENTITY_NOT_FOUND);
    });

    it('reflects a pending UPDATE edit action (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerProperty,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'name',
        newValue: {name: 'UpdatedName'},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result = await service.getContainerPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.name).toBe('UpdatedName');
    });
  });
});
