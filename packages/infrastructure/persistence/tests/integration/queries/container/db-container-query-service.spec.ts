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
import {CHANGE_OPERATION, CHANGE_STATUS, RESULT_KIND, SOURCE} from '@arc/core';
import {DbContainerQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/container/db-container-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {ContainerPropertyDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ContainerSchema,
  ContainerRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/container/container.schema.js';
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

describe('DbContainerQueryService.findPropertyPayloads Integration Tests', () => {
  let dataSource: DataSource;
  let containerRepository: Repository<ContainerRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbContainerQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    containerRepository = getTestRepository<ContainerRow>(ContainerSchema);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbContainerQueryService(
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

  async function seedContainerPropertyDef(
    fileSystemId: number,
    systemId: number,
  ): Promise<void> {
    await getTestRepository(ContainerPropertyDefinitionSchema).save({
      systemId,
      fileSystemId,
      propertyId: systemId,
      name: `prop-${systemId}`,
      maxSize: 4,
      propertyType: 'SPF',
      elementsStructure: '[]',
    });
  }

  describe('findPropertyPayloads — Tier 1: no session', () => {
    it('returns Result.ok(null) when containerSystemId does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.findPropertyPayloads(999, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toBeNull();
    });

    it('returns Result.ok with correct PropertyPayloadReadModel[] when container exists', async () => {
      const {fileSystemId} = await createFileDependency();

      await containerRepository.save({
        systemId: 1,
        containerId: 10,
        containerTypeSystemId: 0,
        fileSystemId,
      });
      await seedContainerPropertyDef(fileSystemId, 50);
      const payload = Buffer.from([0x01, 0x02]);
      await dataSource.query(
        `INSERT INTO container_property_data (system_id, container_system_id, property_system_id, payload) VALUES (?, ?, ?, ?)`,
        [100, 1, 50, payload],
      );

      const result = await service.findPropertyPayloads(1, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).not.toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].systemId).toBe(100);
      expect(result.data![0].propertySystemId).toBe(50);
    });
  });

  describe('findPropertyPayloads — Tier 2: session with no pending changes', () => {
    it('returns baseline property payloads unchanged when session has no edit actions', async () => {
      const {fileSystemId} = await createFileDependency();
      await createSession(fileSystemId);

      await containerRepository.save({
        systemId: 1,
        containerId: 10,
        containerTypeSystemId: 0,
        fileSystemId,
      });
      await seedContainerPropertyDef(fileSystemId, 50);
      await dataSource.query(
        `INSERT INTO container_property_data (system_id, container_system_id, property_system_id, payload) VALUES (?, ?, ?, x'')`,
        [100, 1, 50],
      );

      const result = await service.findPropertyPayloads(1, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data![0].propertySystemId).toBe(50);
    });
  });

  describe('findPropertyPayloads — Tier 3: session with pending changes', () => {
    it('returns updated payload when a pending UPDATE edit action exists for a property', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerRepository.save({
        systemId: 1,
        containerId: 10,
        containerTypeSystemId: 0,
        fileSystemId,
      });
      await seedContainerPropertyDef(fileSystemId, 50);
      await dataSource.query(
        `INSERT INTO container_property_data (system_id, container_system_id, property_system_id, payload) VALUES (?, ?, ?, ?)`,
        [100, 1, 50, Buffer.from([0xaa])],
      );

      const updatedPayload = Buffer.from([0xbb]);
      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerPropertyData,
        targetSystemId: 100,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: 'payload',
        newValue: {payload: updatedPayload},
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result = await service.findPropertyPayloads(1, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(Buffer.from(result.data![0].payload as Uint8Array)).toEqual(
        updatedPayload,
      );
    });

    it('returns null when a pending DELETE edit action targets the container', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await containerRepository.save({
        systemId: 1,
        containerId: 10,
        containerTypeSystemId: 0,
        fileSystemId,
      });

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.Container,
        targetSystemId: 1,
        aggregateId: 1,
        operation: CHANGE_OPERATION.Delete,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: null,
        newValue: null,
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result = await service.findPropertyPayloads(1, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toBeNull();
    });

    it('returns property payloads assembled from a CREATE action when no base row exists', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.Container,
        targetSystemId: 2,
        aggregateId: 2,
        operation: CHANGE_OPERATION.Create,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: null,
        newValue: {
          systemId: 2,
          containerId: 20,
          containerTypeSystemId: 0,
          fileSystemId,
        },
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });
      const createdPayload = Buffer.from([0xcc]);
      await editActionRepository.save({
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.ContainerPropertyData,
        targetSystemId: 200,
        aggregateId: 2,
        operation: CHANGE_OPERATION.Create,
        changeStatus: CHANGE_STATUS.Staged,
        source: SOURCE.Manual,
        fieldPath: null,
        newValue: {
          systemId: 200,
          containerSystemId: 2,
          propertySystemId: 75,
          payload: createdPayload,
        },
        groupId: null,
        linkedEntityGroupId: null,
        validUntil: null,
      });

      const result = await service.findPropertyPayloads(2, fileSystemId);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).not.toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].systemId).toBe(200);
      expect(result.data![0].propertySystemId).toBe(75);
    });
  });
});
