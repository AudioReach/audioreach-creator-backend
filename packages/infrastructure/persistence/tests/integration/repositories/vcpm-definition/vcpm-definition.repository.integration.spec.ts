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
import {VcpmModuleDefinition} from '@arc/core';
import {
  getTestDataSource,
  getTestRepository,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../../helpers/test-database-setup.js';
import {TypeOrmVcpmDefinitionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/vcpm-definition/vcpm-definition.repository.js';
import {VcpmModuleDefinitionFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/definitions/vcpm/vcpm-module-definition-fetcher.js';
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

function makeRepository(ds: DataSource): TypeOrmVcpmDefinitionRepository {
  return new TypeOrmVcpmDefinitionRepository(ds.manager);
}

function makeFetcher(ds: DataSource): VcpmModuleDefinitionFetcher {
  return new VcpmModuleDefinitionFetcher(ds.manager);
}

describe('TypeOrmVcpmDefinitionRepository', () => {
  it('groups VCPM module definitions with their parameters', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
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

    const repository = makeRepository(ds);

    const [definition] = await repository.getAllVcpmModuleDefinitions(FILE_ID);

    expect(definition).toBeInstanceOf(VcpmModuleDefinition);
    expect(definition).toMatchObject({
      systemId: 401,
      naturalId: 9001,
      fileSystemId: FILE_ID,
      name: 'VCPM',
      displayName: 'VCPM',
      parameters: [
        expect.objectContaining({
          systemId: 402,
          naturalId: 7,
          name: 'param',
          maxSize: 4,
          pidType: 'UInt32',
          isPersistent: true,
          isReadOnly: false,
          toolPolicies: [],
          elementsStructure: '[]',
        }),
      ],
    });
    expect([...definition.attributes.entries()]).toEqual([]);
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
        expect.objectContaining({
          systemId: 401,
          naturalId: 9001,
          fileSystemId: FILE_ID,
          name: 'VCPM',
          displayName: 'VCPM',
          parameters: [
            expect.objectContaining({
              systemId: 402,
              naturalId: 7,
              name: 'param',
              maxSize: 4,
              pidType: 'UInt32',
              isPersistent: true,
              isReadOnly: false,
              toolPolicies: [],
              elementsStructure: '',
            }),
          ],
        }),
        expect.objectContaining({
          systemId: 403,
          naturalId: 9002,
          fileSystemId: FILE_ID,
          name: 'VCPM without parameters',
          displayName: 'VCPM without parameters',
          parameters: [],
        }),
      ]),
    );
    for (const definition of result) {
      expect(definition).toBeInstanceOf(VcpmModuleDefinition);
      expect([...definition.attributes.entries()]).toEqual([]);
    }
  });
});
