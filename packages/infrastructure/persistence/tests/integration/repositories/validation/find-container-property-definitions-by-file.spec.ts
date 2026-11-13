/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {TypeOrmValidationQueryRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/validation/typeorm-validation-query.repository.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 300;
const OTHER_FILE_ID = 301;
const PROP_A_ID = 60;
const PROP_B_ID = 61;
const STRUCTURE_A = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'stack_size',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);
const STRUCTURE_B = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'graph_pos',
    dataType: 'Int16',
    isReadOnly: false,
  },
]);

async function seedProjectAndFiles() {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  for (const systemId of [FILE_ID, OTHER_FILE_ID]) {
    await getTestRepository(ArcDbFileSchema).save({
      systemId,
      projectSystemId: 1,
      fileName: `f${systemId}.acdb`,
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
  }
}

async function seedPropDef(
  ds: DataSource,
  systemId: number,
  naturalId: number,
  name: string,
  elementsStructure: string | null,
  fileSystemId = FILE_ID,
) {
  await ds.query(
    `INSERT INTO container_property_definitions (system_id, file_system_id, property_id, name, description, max_size, property_type, elements_structure) VALUES (?, ?, ?, ?, ?, 4, 'SPF', ?)`,
    [
      systemId,
      fileSystemId,
      naturalId,
      name,
      `${name} desc`,
      elementsStructure,
    ],
  );
}

describe('TypeOrmValidationQueryRepository.findContainerPropertyDefinitionsByFile', () => {
  let ds: DataSource;
  let repo: TypeOrmValidationQueryRepository;

  beforeAll(async () => {
    await setupIntegrationTest();
    ds = getTestDataSource();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    repo = new TypeOrmValidationQueryRepository(ds);
  });

  it('should return empty array when file has no property definitions', async () => {
    const result = await repo.findContainerPropertyDefinitionsByFile(FILE_ID);
    expect(result).toHaveLength(0);
  });

  it('should map every column of a property definition', async () => {
    await seedProjectAndFiles();
    await seedPropDef(ds, PROP_A_ID, 0x08001013, 'Stack Size', STRUCTURE_A);

    const result = await repo.findContainerPropertyDefinitionsByFile(FILE_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      systemId: PROP_A_ID,
      fileSystemId: FILE_ID,
      naturalId: 0x08001013,
      name: 'Stack Size',
      description: 'Stack Size desc',
      type: 'SPF',
      maxSize: 4,
      elementsStructure: STRUCTURE_A,
    });
  });

  it('should load every property definition of the file', async () => {
    await seedProjectAndFiles();
    await seedPropDef(ds, PROP_A_ID, 1, 'Stack Size', STRUCTURE_A);
    await seedPropDef(ds, PROP_B_ID, 2, 'Graph Position', STRUCTURE_B);

    const result = await repo.findContainerPropertyDefinitionsByFile(FILE_ID);

    expect(result.map(d => d.systemId).sort()).toEqual([PROP_A_ID, PROP_B_ID]);
  });

  it('should not load property definitions from a different file', async () => {
    await seedProjectAndFiles();
    await seedPropDef(
      ds,
      PROP_A_ID,
      1,
      'Stack Size',
      STRUCTURE_A,
      OTHER_FILE_ID,
    );

    const result = await repo.findContainerPropertyDefinitionsByFile(FILE_ID);

    expect(result).toHaveLength(0);
  });

  it('should map a NULL elements_structure to an empty string', async () => {
    await seedProjectAndFiles();
    await seedPropDef(ds, PROP_A_ID, 1, 'No Structure', null);

    const result = await repo.findContainerPropertyDefinitionsByFile(FILE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].elementsStructure).toBe('');
  });
});
