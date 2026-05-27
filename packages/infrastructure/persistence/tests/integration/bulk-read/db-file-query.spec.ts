/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DbFileQuery} from '../../../src/persistence-typeorm-sqllite/queries/db-file-query.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {Repository} from 'typeorm';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';

describe('DbFileQuery', () => {
  let fileQuery: DbFileQuery;
  let fileRepository: Repository<ArcDbFileRow>;
  let projectRepository: Repository<ProjectRow>;
  let testProjectId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const dataSource = getTestDataSource();
    fileQuery = new DbFileQuery(dataSource);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    // Create a test project for foreign key constraint
    const project = await projectRepository.save({
      name: 'Test Project',
      description: 'Test project for header metadata',
      type: 'Offline',
    });
    testProjectId = project.systemId;
  });

  describe('readFileProperties', () => {
    it('should read header metadata from files table', async () => {
      // Insert test file with header data
      const testFile = await fileRepository.save({
        projectSystemId: testProjectId,
        fileName: JSON.stringify({acdb: 'test.acdb', awsp: 'test.awsp'}),
        description: 'Test file',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
        openStatus: 'READY',
        headerVersion: 1,
        acdbVersionMajor: 2,
        acdbVersionMinor: 3,
        acdbVersionRevision: 4,
        acdbVersionCplInfo: 5,
        codecInfos: JSON.stringify([
          {codecId: 1, majorVersion: 2, minorVersion: 0},
        ]),
        modifiedDate: 1234567890,
        oemInfo: 'Test OEM',
      });

      const result = await fileQuery.readFileProperties(testFile.systemId);

      expect(result).toBeDefined();
      expect(result.version.major).toBe(2);
      expect(result.version.minor).toBe(3);
      expect(result.version.revision).toBe(4);
      expect(result.version.cplInfo).toBe(5);
      expect(result.codecInfos).toHaveLength(1);
      expect(result.codecInfos[0].codecId).toBe(1);
      expect(result.modifiedDate).toBe(1234567890);
      expect(result.oemInfo).toBe('Test OEM');
    });

    it('should throw error if file not found', async () => {
      await expect(fileQuery.readFileProperties(99999)).rejects.toThrow(
        'File not found: 99999',
      );
    });

    it('should provide defaults for null header values', async () => {
      const testFile = await fileRepository.save({
        projectSystemId: testProjectId,
        fileName: JSON.stringify({acdb: 'legacy.acdb', awsp: 'legacy.awsp'}),
        description: 'Legacy file',
        metadata: '{}',
        isTarget: false,
        lastReservedId: 0,
        openStatus: 'READY',
        headerVersion: 0,
        acdbVersionMajor: 0,
        acdbVersionMinor: 0,
        acdbVersionRevision: 0,
        acdbVersionCplInfo: 0,
        codecInfos: '[]',
        modifiedDate: 0,
        oemInfo: '',
      });

      const result = await fileQuery.readFileProperties(testFile.systemId);

      expect(result.version.major).toBe(1);
      expect(result.version.minor).toBe(0);
      expect(result.version.revision).toBe(0);
      expect(result.version.cplInfo).toBe(0);
      expect(result.codecInfos).toEqual([]);
      expect(result.modifiedDate).toBeDefined();
      expect(result.oemInfo).toBe('AudioReach Creator');
    });
  });
});
