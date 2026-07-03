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
import {DbDriverModuleDefinitionQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/driver-module-definition/db-driver-module-definition-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {EntityName} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  DriverModuleDefinitionSchema,
  DriverModuleDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import {
  DriverModuleParameterDefinitionSchema,
  DriverModuleParameterDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
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

describe('DbDriverModuleDefinitionQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let moduleDefinitionRepository: Repository<DriverModuleDefinitionRow>;
  let parameterDefinitionRepository: Repository<DriverModuleParameterDefinitionRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbDriverModuleDefinitionQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    moduleDefinitionRepository = getTestRepository<DriverModuleDefinitionRow>(
      DriverModuleDefinitionSchema,
    );
    parameterDefinitionRepository =
      getTestRepository<DriverModuleParameterDefinitionRow>(
        DriverModuleParameterDefinitionSchema,
      );
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbDriverModuleDefinitionQueryService(
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

  async function saveUpdateAction(
    session: ProjectSessionRow,
    targetSystemId: number,
    aggregateId: number,
    targetTable: EntityName,
    newValue: unknown,
  ): Promise<void> {
    await editActionRepository.save({
      targetSystemId,
      aggregateId,
      sessionId: session.sessionId,
      targetTable,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue,
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });
  }

  /**
   * Seeds one driver module definition with one parameter and returns its
   * systemId. moduleIndex offsets every child systemId/naturalId so
   * multiple modules can be seeded in the same file without collisions.
   */
  async function createModuleDefinition(
    fileSystemId: number,
    moduleIndex: number,
  ): Promise<number> {
    const base = 1000 * (moduleIndex + 1);

    const module = await moduleDefinitionRepository.save({
      systemId: base + 1,
      fileSystemId,
      moduleDefinitionId: base + 1,
      name: `DriverModule${moduleIndex}`,
    });

    await parameterDefinitionRepository.save({
      systemId: base + 2,
      driverModuleDefinitionSystemId: module.systemId,
      parameterId: base + 2,
      name: `Param${moduleIndex}`,
      maxSize: 4,
      paramStructure: '[]',
    });

    return module.systemId;
  }

  describe('getAllDriverModuleDefinitions — no session', () => {
    it('returns an empty array when the file has no module definitions', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns full summary shape for a single module definition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);

      const result = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].systemId).toBe(moduleSystemId);
      expect(result.data[0].parameterDefinitions).toHaveLength(1);
    });

    it('filters by moduleDefinitionId', async () => {
      const {fileSystemId} = await createFileDependency();
      await createModuleDefinition(fileSystemId, 0);
      const secondSystemId = await createModuleDefinition(fileSystemId, 1);

      const result = await service.getAllDriverModuleDefinitions(fileSystemId, {
        moduleDefinitionNaturalId: 2001,
      });

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].systemId).toBe(secondSystemId);
    });

    it('filters by parameterId', async () => {
      const {fileSystemId} = await createFileDependency();
      const firstSystemId = await createModuleDefinition(fileSystemId, 0);
      await createModuleDefinition(fileSystemId, 1);

      const result = await service.getAllDriverModuleDefinitions(fileSystemId, {
        parameterNaturalId: 1002,
      });

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].systemId).toBe(firstSystemId);
    });

    it('returns an empty array when a filter matches nothing', async () => {
      const {fileSystemId} = await createFileDependency();
      await createModuleDefinition(fileSystemId, 0);

      const result = await service.getAllDriverModuleDefinitions(fileSystemId, {
        moduleDefinitionNaturalId: 999999,
      });

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('combines moduleDefinitionId and parameterId with AND semantics', async () => {
      const {fileSystemId} = await createFileDependency();
      const firstSystemId = await createModuleDefinition(fileSystemId, 0);

      const matchResult = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {
          moduleDefinitionNaturalId: 1001,
          parameterNaturalId: 1002,
        },
      );
      expect(matchResult.kind).toBe(RESULT_KIND.Ok);
      if (matchResult.kind !== RESULT_KIND.Ok) return;
      expect(matchResult.data).toHaveLength(1);
      expect(matchResult.data[0].systemId).toBe(firstSystemId);

      const noMatchResult = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {
          moduleDefinitionNaturalId: 1001,
          parameterNaturalId: 2002,
        },
      );
      expect(noMatchResult.kind).toBe(RESULT_KIND.Ok);
      if (noMatchResult.kind !== RESULT_KIND.Ok) return;
      expect(noMatchResult.data).toEqual([]);
    });
  });

  describe('getAllDriverModuleDefinitions — session overlay', () => {
    it('reflects a session UPDATE on the root module definition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        moduleSystemId,
        moduleSystemId,
        ENTITY_NAMES.DriverModuleDefinition,
        {name: 'RenamedDriverModule'},
      );

      const result = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('RenamedDriverModule');
    });

    it('reflects a session UPDATE on a parameter definition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const paramSystemId = 1002; // base(1000) + 2, from createModuleDefinition
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        paramSystemId,
        moduleSystemId,
        ENTITY_NAMES.DriverModuleParameterDefinition,
        {name: 'RenamedParam'},
      );

      const result = await service.getAllDriverModuleDefinitions(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].parameterDefinitions[0].name).toBe('RenamedParam');
    });
  });

  describe('getDriverModuleDefinition', () => {
    it('returns Result.fail(ENTITY_NOT_FOUND) when the module does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getDriverModuleDefinition(
        999999,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
    });

    it('returns the matching module definition summary', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);

      const result = await service.getDriverModuleDefinition(
        moduleSystemId,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.systemId).toBe(moduleSystemId);
      expect(result.data.parameterDefinitions).toHaveLength(1);
    });
  });
});
