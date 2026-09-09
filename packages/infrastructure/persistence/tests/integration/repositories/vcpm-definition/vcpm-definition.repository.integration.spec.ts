/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../../helpers/test-database-setup.js';
import {TypeOrmVcpmDefinitionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/vcpm-definition/vcpm-definition.repository.js';
import {VcpmModuleDefinitionFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/definitions/vcpm/vcpm-module-definition-fetcher.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {VcpmModuleDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {VcpmModuleParameterDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';

const FILE_ID = 200;

beforeAll(async () => setupIntegrationTest());
afterAll(async () => teardownIntegrationTest());
beforeEach(async () => setupEachTest());

async function seedBase(ds: DataSource): Promise<number> {
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
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return session.sessionId;
}

function makeRepository(
  ds: DataSource,
  sessionId: number,
): TypeOrmVcpmDefinitionRepository {
  const editActionsQs = new EditActionsQueryService(ds);
  const writer = new PendingChangeWriter(
    editActionsQs,
    new PendingChangeCache(),
  );
  const uow = {
    getWriteContext: () => ({
      session: {sessionId, fileSystemId: FILE_ID},
      groupId: 'g1',
    }),
  } as any;
  const idGeneration = {getNextId: async () => 1} as any;
  return new TypeOrmVcpmDefinitionRepository(
    writer,
    ds.manager,
    uow,
    idGeneration,
  );
}

function makeFetcher(ds: DataSource): VcpmModuleDefinitionFetcher {
  return new VcpmModuleDefinitionFetcher(ds.manager);
}

describe('TypeOrmVcpmDefinitionRepository', () => {
  it('groups VCPM module definitions with their parameters', async () => {
    const ds = getTestDataSource();
    const sessionId = await seedBase(ds);
    await getTestRepository(VcpmModuleDefinitionSchema).save({
      systemId: 401,
      naturalId: 9001,
      name: 'VCPM',
      fileSystemId: FILE_ID,
    });
    await getTestRepository(VcpmModuleParameterDefinitionSchema).save({
      systemId: 402,
      naturalId: 7,
      name: 'param',
      maxSize: 4,
      pidType: 'UInt32',
      isPersistent: true,
      isReadOnly: false,
      elementsStructure: '[]',
      vcpmModuleDefinitionSystemId: 401,
    });

    const repository = makeRepository(ds, sessionId);

    await expect(
      repository.getAllVcpmModuleDefinitions(FILE_ID),
    ).resolves.toEqual([
      {
        systemId: 401,
        moduleDefinitionId: 9001,
        parameters: [
          {
            systemId: 402,
            paramId: 7,
            elementsStructure: '[]',
            isReadOnly: false,
          },
        ],
      },
    ]);
  });

  it('fetches definitions with grouped parameters and empty parameter collections', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);

    await getTestRepository(VcpmModuleDefinitionSchema).save([
      {
        systemId: 401,
        naturalId: 9001,
        name: 'VCPM',
        fileSystemId: FILE_ID,
      },
      {
        systemId: 403,
        naturalId: 9002,
        name: 'VCPM without parameters',
        fileSystemId: FILE_ID,
      },
    ]);
    await getTestRepository(VcpmModuleParameterDefinitionSchema).save([
      {
        systemId: 402,
        naturalId: 7,
        name: 'param',
        maxSize: 4,
        pidType: 'UInt32',
        isPersistent: true,
        isReadOnly: false,
        elementsStructure: null,
        vcpmModuleDefinitionSystemId: 401,
      },
    ]);

    const result = await makeFetcher(ds).fetchMany(FILE_ID);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        {
          systemId: 401,
          moduleDefinitionId: 9001,
          parameters: [
            {
              systemId: 402,
              paramId: 7,
              elementsStructure: '',
              isReadOnly: false,
            },
          ],
        },
        {
          systemId: 403,
          moduleDefinitionId: 9002,
          parameters: [],
        },
      ]),
    );
  });
});
