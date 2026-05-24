/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
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
      systemId: 1,
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file = await arcDbFileRepository.save({
      systemId: 100,
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    // Initialize last_reserved_id = fileId so composite IDs correctly encode the file scope
    await dataSource.query(
      `UPDATE files SET last_reserved_id = ? WHERE system_id = ?`,
      [file.systemId, file.systemId],
    );
    fileId = file.systemId;
    service = new EntityIdService(fileId, dataSource);
  });

  /** Read last_reserved_id directly from the DB for assertion. */
  async function readLastReservedId(): Promise<number> {
    const rows = (await dataSource.query(
      `SELECT last_reserved_id FROM files WHERE system_id = ?`,
      [fileId],
    )) as Array<{last_reserved_id: number}>;
    return rows[0].last_reserved_id;
  }

  // ---------------------------------------------------------------------------
  describe('getNextId', () => {
    it('auto-reserves on first call (no prior reserveBlock)', async () => {
      const id = await service.getNextId();
      expect(id).toBe(1 * FILE_ID_MODULUS + 2 * fileId);
      // DB should reflect a full auto-reserve block (100 IDs by default)
      expect(await readLastReservedId()).toBe(fileId + 100 * FILE_ID_MODULUS);
    });

    it('returns sequential composite IDs after reserveBlock', async () => {
      await service.reserveBlock();

      expect(await service.getNextId()).toBe(1 * FILE_ID_MODULUS + 2 * fileId);
      expect(await service.getNextId()).toBe(2 * FILE_ID_MODULUS + 2 * fileId);
      expect(await service.getNextId()).toBe(3 * FILE_ID_MODULUS + 2 * fileId);
    });

    it('auto-reserves when the reserved block is exhausted', async () => {
      // Use a small autoReserveSize so we can exhaust it quickly
      const smallService = new EntityIdService(fileId, dataSource, 2);
      await smallService.reserveBlock(2); // reserve exactly 2 IDs

      await smallService.getNextId(); // seq 1
      await smallService.getNextId(); // seq 2 — block exhausted

      // This call should auto-reserve 2 more IDs and return seq 3
      const id = await smallService.getNextId();
      expect(id).toBe(3 * FILE_ID_MODULUS + 2 * fileId);
    });

    it('coalesces concurrent auto-reserve calls into one DB round-trip', async () => {
      const reserveSpy = jest.spyOn(service, 'reserveBlock');

      // Fire 5 concurrent getNextId calls on an empty block
      const ids = await Promise.all(
        Array.from({length: 5}, () => service.getNextId()),
      );

      // Only one DB reserve call should have fired
      expect(reserveSpy).toHaveBeenCalledTimes(1);
      // All returned IDs must be unique
      expect(new Set(ids).size).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  describe('reserveBlock', () => {
    it('returns the first ID in the reserved block', async () => {
      const firstId = await service.reserveBlock();
      expect(firstId).toBe(1 * FILE_ID_MODULUS + 2 * fileId);
    });

    it('atomically advances last_reserved_id in the DB by blockSize * FILE_ID_MODULUS', async () => {
      const blockSize = 5;
      await service.reserveBlock(blockSize);

      expect(await readLastReservedId()).toBe(
        fileId + blockSize * FILE_ID_MODULUS,
      );
    });

    it('second call starts a new block immediately after the first', async () => {
      await service.reserveBlock(3); // block 1: seq 1–3
      await service.getNextId(); // seq 1
      await service.getNextId(); // seq 2
      await service.getNextId(); // seq 3

      await service.reserveBlock(3); // block 2: seq 4–6
      expect(await service.getNextId()).toBe(4 * FILE_ID_MODULUS + 2 * fileId);
    });

    it('custom blockSize limits the number of IDs before next auto-reserve', async () => {
      await service.reserveBlock(5);

      for (let i = 0; i < 5; i++) {
        await expect(service.getNextId()).resolves.toBeDefined();
      }
      // 6th call triggers auto-reserve transparently — no throw
      await expect(service.getNextId()).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('persistActual', () => {
    it('reclaims the unused tail of the reserved block', async () => {
      await service.reserveBlock(10);
      await service.getNextId(); // seq 1
      await service.getNextId(); // seq 2
      await service.getNextId(); // seq 3 — stop here, 7 IDs unused

      await service.persistLastUsedId();

      expect(await readLastReservedId()).toBe(3 * FILE_ID_MODULUS + fileId);
    });

    it('does not reduce last_reserved_id if another request has advanced the watermark', async () => {
      await service.reserveBlock(10); // reserve seq 1–10
      await service.getNextId(); // use seq 1

      // Simulate a concurrent request advancing the watermark beyond our block
      const advancedMark = fileId + 20 * FILE_ID_MODULUS;
      await dataSource.query(
        `UPDATE files SET last_reserved_id = ? WHERE system_id = ?`,
        [advancedMark, fileId],
      );

      await service.persistLastUsedId();

      // WHERE last_reserved_id <= blockEnd prevents going backwards
      expect(await readLastReservedId()).toBe(advancedMark);
    });
  });
});
