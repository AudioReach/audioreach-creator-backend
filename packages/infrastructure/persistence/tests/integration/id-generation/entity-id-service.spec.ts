/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource, Repository} from 'typeorm';
import {EntityIdService} from '../../../src/id-generation/entity-id.service.js';
import {FILE_ID_MODULUS} from '../../../src/id-generation/composite-id.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

describe('EntityIdService', () => {
  let dataSource: DataSource;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let fileId: number;
  let service: EntityIdService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();

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
    });
    // Initialize last_entity_id = fileId so composite IDs correctly encode the file scope
    await dataSource.query(
      `UPDATE files SET last_entity_id = ? WHERE system_id = ?`,
      [file.systemId, file.systemId],
    );
    fileId = file.systemId;
    service = new EntityIdService(fileId, dataSource);
  });

  /** Read last_entity_id directly from the DB for assertion. */
  async function readLastEntityId(): Promise<number> {
    const rows = (await dataSource.query(
      `SELECT last_entity_id FROM files WHERE system_id = ?`,
      [fileId],
    )) as Array<{last_entity_id: number}>;
    return rows[0].last_entity_id;
  }

  // ---------------------------------------------------------------------------
  describe('getNextId', () => {
    it('throws before reserveBlock is called', () => {
      expect(() => service.getNextId()).toThrow('not initialized');
    });

    it('returns sequential composite IDs after reserveBlock', async () => {
      await service.reserveBlock();

      expect(service.getNextId()).toBe(1 * FILE_ID_MODULUS + fileId);
      expect(service.getNextId()).toBe(2 * FILE_ID_MODULUS + fileId);
      expect(service.getNextId()).toBe(3 * FILE_ID_MODULUS + fileId);
    });

    it('throws when the reserved block is exhausted', async () => {
      await service.reserveBlock(3); // reserve exactly 3 IDs

      service.getNextId(); // seq 1
      service.getNextId(); // seq 2
      service.getNextId(); // seq 3

      expect(() => service.getNextId()).toThrow('ID block exhausted');
    });
  });

  // ---------------------------------------------------------------------------
  describe('reserveBlock', () => {
    it('returns the first ID in the reserved block', async () => {
      const firstId = await service.reserveBlock();
      expect(firstId).toBe(1 * FILE_ID_MODULUS + fileId);
    });

    it('atomically advances last_entity_id in the DB by blockSize * FILE_ID_MODULUS', async () => {
      const blockSize = 5;
      await service.reserveBlock(blockSize);

      expect(await readLastEntityId()).toBe(
        fileId + blockSize * FILE_ID_MODULUS,
      );
    });

    it('second call starts a new block immediately after the first', async () => {
      await service.reserveBlock(3); // block 1: seq 1–3
      service.getNextId(); // seq 1
      service.getNextId(); // seq 2
      service.getNextId(); // seq 3

      await service.reserveBlock(3); // block 2: seq 4–6
      expect(service.getNextId()).toBe(4 * FILE_ID_MODULUS + fileId);
    });

    it('custom blockSize limits the number of available IDs', async () => {
      await service.reserveBlock(5);

      for (let i = 0; i < 5; i++) {
        expect(() => service.getNextId()).not.toThrow();
      }
      expect(() => service.getNextId()).toThrow('ID block exhausted');
    });
  });

  // ---------------------------------------------------------------------------
  describe('persistActual', () => {
    it('reclaims the unused tail of the reserved block', async () => {
      await service.reserveBlock(10);
      service.getNextId(); // seq 1
      service.getNextId(); // seq 2
      service.getNextId(); // seq 3 — stop here, 7 IDs unused

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await service.persistActual(queryRunner);
      } finally {
        await queryRunner.release();
      }

      expect(await readLastEntityId()).toBe(3 * FILE_ID_MODULUS + fileId);
    });

    it('does not reduce last_entity_id if another request has advanced the watermark', async () => {
      await service.reserveBlock(10); // reserve seq 1–10
      service.getNextId(); // use seq 1

      // Simulate a concurrent request advancing the watermark beyond our block
      const advancedMark = fileId + 20 * FILE_ID_MODULUS;
      await dataSource.query(
        `UPDATE files SET last_entity_id = ? WHERE system_id = ?`,
        [advancedMark, fileId],
      );

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await service.persistActual(queryRunner);
      } finally {
        await queryRunner.release();
      }

      // WHERE last_entity_id > current prevents going backwards
      expect(await readLastEntityId()).toBe(advancedMark);
    });
  });
});
