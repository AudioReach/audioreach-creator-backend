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
import {ERROR_CODES, RESULT_KIND} from '@arc/core';
import {DbContainerPropertyDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/container-property-definition/db-container-property-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {
  ContainerPropertyDefinitionSchema,
  type ContainerPropertyRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.js';
import {
  ProjectSchema,
  type ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  type ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

describe('DbContainerPropertyDefQueryService.getContainerPropertyWithElements', () => {
  let dataSource: DataSource;
  let containerPropertyRepository: Repository<ContainerPropertyRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let service: DbContainerPropertyDefQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    containerPropertyRepository = getTestRepository<ContainerPropertyRow>(
      ContainerPropertyDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
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

  it('returns Result.ok with elementsStructure when the row exists', async () => {
    const {fileSystemId} = await createFileDependency();
    const PROPERTY_SYSTEM_ID = 42;

    await containerPropertyRepository.save({
      systemId: PROPERTY_SYSTEM_ID,
      fileSystemId,
      naturalId: 100,
      name: 'HeapProperty',
      maxSize: 4,
      propertyType: 'SPF',
      elementsStructure: '<struct><elem type="uint32"/></struct>',
    });

    const result = await service.getContainerPropertyWithElements(
      PROPERTY_SYSTEM_ID,
      fileSystemId,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.systemId).toBe(PROPERTY_SYSTEM_ID);
    expect(result.data.elementsStructure).toBe(
      '<struct><elem type="uint32"/></struct>',
    );
  });

  it('returns Result.fail with ENTITY_NOT_FOUND when the row does not exist', async () => {
    const {fileSystemId} = await createFileDependency();

    const result = await service.getContainerPropertyWithElements(
      999_999,
      fileSystemId,
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind !== RESULT_KIND.Fail) return;
    expect(result.issues[0]?.code).toBe(ERROR_CODES.ENTITY_NOT_FOUND);
  });
});
