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
import {DbSubgraphPropertyDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/subgraph-property-definition/db-subgraph-property-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  SubgraphPropertyDefinitionSchema,
  SubgraphPropertyRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
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

describe('DbSubgraphPropertyDefQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let subgraphPropertyRepository: Repository<SubgraphPropertyRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbSubgraphPropertyDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    subgraphPropertyRepository = getTestRepository<SubgraphPropertyRow>(
      SubgraphPropertyDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbSubgraphPropertyDefQueryService(
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

  describe('getAllSubgraphPropertyDefinitions', () => {
    it('returns an empty array when the file has no subgraph property definitions (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns all subgraph property definitions for the file, including isVoice (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: true,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        systemId: 1,
        propertyId: 100,
        name: 'MyProperty',
        isVoice: true,
      });
    });

    it('filters by propertyNaturalId when provided', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'FirstProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });
      await subgraphPropertyRepository.save({
        systemId: 2,
        fileSystemId,
        propertyId: 200,
        name: 'SecondProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      const result = await service.getAllSubgraphPropertyDefinitions(
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

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
    });

    it('reflects a pending UPDATE edit action on isVoice (Tier 3)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SubgraphPropertyDefinition,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'isVoice',
        newValue: {isVoice: true},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result =
        await service.getAllSubgraphPropertyDefinitions(fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].isVoice).toBe(true);
    });
  });

  describe('getSubgraphPropertyDefinition', () => {
    it('returns the property definition by systemId (Tier 1 — no session)', async () => {
      const {fileSystemId} = await createFileDependency();

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'MyProperty',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: true,
      });

      const result = await service.getSubgraphPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.systemId).toBe(1);
      expect(result.data.maxSize).toBe(4);
      expect(result.data.isVoice).toBe(true);
    });

    it('returns Result.fail with ENTITY_NOT_FOUND when the systemId does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getSubgraphPropertyDefinition(
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

      await subgraphPropertyRepository.save({
        systemId: 1,
        fileSystemId,
        propertyId: 100,
        name: 'OriginalName',
        maxSize: 4,
        propertyType: 'SPF',
        elementsStructure: '[]',
        isVoice: false,
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SubgraphPropertyDefinition,
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

      const result = await service.getSubgraphPropertyDefinition(
        1,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.name).toBe('UpdatedName');
    });
  });
});
