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

const FILE_ID = 200;
const OTHER_FILE_ID = 201;
const CONTAINER_A_ID = 10;
const CONTAINER_B_ID = 11;
const PROP_DEF_A_ID = 50;
const PROP_DEF_B_ID = 51;
const PAYLOAD_A = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const PAYLOAD_B = new Uint8Array([0xab, 0xcd]);

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

async function seedContainer(
  ds: DataSource,
  systemId: number,
  naturalId: number,
  fileSystemId = FILE_ID,
) {
  await ds.query(
    `INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (?, ?, 5, ?)`,
    [systemId, naturalId, fileSystemId],
  );
}

async function seedPropDef(
  ds: DataSource,
  systemId: number,
  naturalId: number,
) {
  await ds.query(
    `INSERT INTO container_property_definitions (system_id, file_system_id, property_id, name, max_size, property_type, elements_structure) VALUES (?, ?, ?, ?, 4, 'SPF', '[]')`,
    [systemId, FILE_ID, naturalId, `prop-${naturalId}`],
  );
}

async function seedPropData(
  ds: DataSource,
  systemId: number,
  containerSystemId: number,
  propertySystemId: number,
  payload: Uint8Array,
) {
  await ds.query(
    `INSERT INTO container_property_data (system_id, container_system_id, property_system_id, payload) VALUES (?, ?, ?, ?)`,
    [systemId, containerSystemId, propertySystemId, Buffer.from(payload)],
  );
}

describe('TypeOrmValidationQueryRepository.findContainersByFile', () => {
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

  it('should return empty array when file has no containers', async () => {
    const result = await repo.findContainersByFile(FILE_ID);
    expect(result).toHaveLength(0);
  });

  it('should load a container with no property data', async () => {
    await seedProjectAndFiles();
    await seedContainer(ds, CONTAINER_A_ID, 1001);

    const result = await repo.findContainersByFile(FILE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(CONTAINER_A_ID);
    expect(result[0].naturalId).toBe(1001);
    expect(result[0].containerTypeSystemId).toBe(5);
    expect(result[0].fileSystemId).toBe(FILE_ID);
    expect(result[0].properties.size).toBe(0);
  });

  it('should load property data keyed by property definition systemId', async () => {
    await seedProjectAndFiles();
    await seedContainer(ds, CONTAINER_A_ID, 1001);
    await seedPropDef(ds, PROP_DEF_A_ID, 1);
    await seedPropDef(ds, PROP_DEF_B_ID, 2);
    await seedPropData(ds, 90, CONTAINER_A_ID, PROP_DEF_A_ID, PAYLOAD_A);
    await seedPropData(ds, 91, CONTAINER_A_ID, PROP_DEF_B_ID, PAYLOAD_B);

    const result = await repo.findContainersByFile(FILE_ID);

    expect(result).toHaveLength(1);
    const props = result[0].properties;
    expect([...props.keys()].sort()).toEqual([PROP_DEF_A_ID, PROP_DEF_B_ID]);
    const propA = props.get(PROP_DEF_A_ID)!;
    expect(propA.propertyDefinitionSystemId).toBe(PROP_DEF_A_ID);
    expect(Array.from(propA.getPayloadCopy()!)).toEqual(Array.from(PAYLOAD_A));
    expect(Array.from(props.get(PROP_DEF_B_ID)!.getPayloadCopy()!)).toEqual(
      Array.from(PAYLOAD_B),
    );
  });

  it('should attach each property row to its own container', async () => {
    await seedProjectAndFiles();
    await seedContainer(ds, CONTAINER_A_ID, 1001);
    await seedContainer(ds, CONTAINER_B_ID, 1002);
    await seedPropDef(ds, PROP_DEF_A_ID, 1);
    await seedPropData(ds, 90, CONTAINER_A_ID, PROP_DEF_A_ID, PAYLOAD_A);
    await seedPropData(ds, 91, CONTAINER_B_ID, PROP_DEF_A_ID, PAYLOAD_B);

    const result = await repo.findContainersByFile(FILE_ID);

    expect(result).toHaveLength(2);
    const a = result.find(c => c.systemId === CONTAINER_A_ID)!;
    const b = result.find(c => c.systemId === CONTAINER_B_ID)!;
    expect(
      Array.from(a.properties.get(PROP_DEF_A_ID)!.getPayloadCopy()!),
    ).toEqual(Array.from(PAYLOAD_A));
    expect(
      Array.from(b.properties.get(PROP_DEF_A_ID)!.getPayloadCopy()!),
    ).toEqual(Array.from(PAYLOAD_B));
  });

  it('should not load containers from a different file', async () => {
    await seedProjectAndFiles();
    await seedContainer(ds, CONTAINER_A_ID, 1001, OTHER_FILE_ID);

    const result = await repo.findContainersByFile(FILE_ID);

    expect(result).toHaveLength(0);
  });
});
