/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  FILE_OPEN_STATUS,
  type ValidationIssue,
  IssueCategory,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import {
  ArcDbFileSchema,
  type ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {TypeOrmProjectRepository} from '../../../src/persistence-typeorm-sqllite/repositories/project/typeorm-project.repository.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  createTestTransaction,
  commitTestTransaction,
  rollbackTestTransaction,
} from '../helpers/test-database-setup.js';

describe('TypeOrmProjectRepository', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  describe('createOfflineProject', () => {
    it('returns success with project and file carrying auto-generated systemIds', async () => {
      const queryRunner = await createTestTransaction();
      try {
        const repo = new TypeOrmProjectRepository(queryRunner.manager);

        const result = await repo.createOfflineProject(
          'TestProject',
          'A test project',
          {
            description: 'ACDB: test.acdb, AWSP: test.awsp',
            metadata: 'upload',
            fileName: 'test.acdb',
            isTarget: true,
            openStatus: FILE_OPEN_STATUS.Loading,
            dataLossIssues: [],
          },
        );

        expect(result.kind).toBe(RESULT_KIND.Ok);
        if (result.kind !== RESULT_KIND.Ok) return;

        expect(result.data.project.systemId).toBeGreaterThan(0);
        expect(result.data.project.name).toBe('TestProject');
        expect(result.data.project.description).toBe('A test project');

        expect(result.data.file.systemId).toBeGreaterThan(0);
        expect(result.data.file.fileName).toBe('test.acdb');
        expect(result.data.file.openStatus).toBe(FILE_OPEN_STATUS.Loading);
        expect(result.data.file.dataLossIssues).toHaveLength(0);

        await commitTestTransaction(queryRunner);
      } catch (e) {
        await rollbackTestTransaction(queryRunner);
        throw e;
      }
    });

    it('returns failResult when project name is duplicated', async () => {
      const qr1 = await createTestTransaction();
      const repo1 = new TypeOrmProjectRepository(qr1.manager);
      const first = await repo1.createOfflineProject('DuplicateName', 'First', {
        description: 'desc',
        metadata: '{}',
        fileName: 'first.acdb',
        isTarget: true,
        openStatus: FILE_OPEN_STATUS.Loading,
        dataLossIssues: [],
      });
      expect(first.kind).toBe(RESULT_KIND.Ok);
      await commitTestTransaction(qr1);

      const qr2 = await createTestTransaction();
      try {
        const repo2 = new TypeOrmProjectRepository(qr2.manager);
        const result = await repo2.createOfflineProject(
          'DuplicateName',
          'Second',
          {
            description: 'desc',
            metadata: '{}',
            fileName: 'second.acdb',
            isTarget: true,
            openStatus: FILE_OPEN_STATUS.Loading,
            dataLossIssues: [],
          },
        );

        expect(result.kind).toBe(RESULT_KIND.Fail);
        if (result.kind !== RESULT_KIND.Fail) return;
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].code).toBe('DB_QUERY_FAILED');
        expect(result.issues[0].message).toBeTruthy();
      } finally {
        await rollbackTestTransaction(qr2);
      }
    });
  });

  describe('updateFileStatus', () => {
    it('updates open_status to READY and clears data_loss_issues', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject(
        'StatusProject',
        'desc',
        {
          description: 'desc',
          metadata: '{}',
          fileName: 'status.acdb',
          isTarget: true,
          openStatus: FILE_OPEN_STATUS.Loading,
          dataLossIssues: [],
        },
      );
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const fileSystemId = createResult.data.file.systemId;

      await repo.updateFileStatus(fileSystemId, FILE_OPEN_STATUS.Ready, []);
      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const rows: Pick<ArcDbFileRow, 'openStatus' | 'dataLossIssues'>[] =
        await dataSource
          .getRepository<ArcDbFileRow>(ArcDbFileSchema)
          .find({select: ['openStatus', 'dataLossIssues']});
      expect(rows[0].openStatus).toBe(FILE_OPEN_STATUS.Ready);
      expect(rows[0].dataLossIssues).toBeNull();
    });

    it('stores serialised ValidationIssue[] and sets PENDING_DATA_LOSS_ACK status', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject(
        'DataLossProject',
        'desc',
        {
          description: 'desc',
          metadata: '{}',
          fileName: 'dataloss.acdb',
          isTarget: true,
          openStatus: FILE_OPEN_STATUS.Loading,
          dataLossIssues: [],
        },
      );
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const fileSystemId = createResult.data.file.systemId;

      const issue: ValidationIssue = {
        code: 'ARC-INSERT-001',
        name: 'Insert failed',
        description: 'A module could not be inserted',
        defaultSeverity: IssueSeverity.Fatal,
        effectiveSeverity: IssueSeverity.Fatal,
        category: IssueCategory.DataLoss,
        fixOptions: [],
        impactedEntity: {entityType: 'SpfModule', systemId: 8388610},
        impactedUsecases: [],
      };

      await repo.updateFileStatus(
        fileSystemId,
        FILE_OPEN_STATUS.PendingDataLossAck,
        [issue],
      );
      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const rows: Pick<ArcDbFileRow, 'openStatus' | 'dataLossIssues'>[] =
        await dataSource
          .getRepository<ArcDbFileRow>(ArcDbFileSchema)
          .find({select: ['openStatus', 'dataLossIssues']});
      expect(rows[0].openStatus).toBe(FILE_OPEN_STATUS.PendingDataLossAck);
      const parsed = JSON.parse(rows[0].dataLossIssues!) as ValidationIssue[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0].code).toBe('ARC-INSERT-001');
    });
  });

  describe('deleteProject', () => {
    it('deletes the project and cascades to its file', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject('ToDelete', 'desc', {
        description: 'desc',
        metadata: '{}',
        fileName: 'delete.acdb',
        isTarget: true,
        openStatus: FILE_OPEN_STATUS.Loading,
        dataLossIssues: [],
      });
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const projectSystemId = createResult.data.project.systemId;

      await repo.deleteProject(projectSystemId);
      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const projects: unknown[] = await dataSource.query(
        'SELECT * FROM projects',
      );
      const files: unknown[] = await dataSource.query('SELECT * FROM files');
      expect(projects).toHaveLength(0);
      expect(files).toHaveLength(0);
    });
  });

  describe('updateFileHeader', () => {
    it('updates all ACDB header fields when provided', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject(
        'HeaderProject',
        'desc',
        {
          description: 'desc',
          metadata: '{}',
          fileName: 'header.acdb',
          isTarget: true,
          openStatus: FILE_OPEN_STATUS.Loading,
          dataLossIssues: [],
        },
      );
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const fileSystemId = createResult.data.file.systemId;

      await repo.updateFileHeader(fileSystemId, {
        headerVersion: 1,
        acdbVersionMajor: 2,
        acdbVersionMinor: 3,
        acdbVersionRevision: 4,
        acdbVersionCplInfo: 5,
        codecInfos: 'codec1,codec2',
        modifiedDate: 1234567890,
        oemInfo: 'OEM Data',
      });
      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const rows: Pick<
        ArcDbFileRow,
        | 'headerVersion'
        | 'acdbVersionMajor'
        | 'acdbVersionMinor'
        | 'acdbVersionRevision'
        | 'acdbVersionCplInfo'
        | 'codecInfos'
        | 'modifiedDate'
        | 'oemInfo'
      >[] = await dataSource.getRepository<ArcDbFileRow>(ArcDbFileSchema).find({
        select: [
          'headerVersion',
          'acdbVersionMajor',
          'acdbVersionMinor',
          'acdbVersionRevision',
          'acdbVersionCplInfo',
          'codecInfos',
          'modifiedDate',
          'oemInfo',
        ],
      });

      expect(rows[0].headerVersion).toBe(1);
      expect(rows[0].acdbVersionMajor).toBe(2);
      expect(rows[0].acdbVersionMinor).toBe(3);
      expect(rows[0].acdbVersionRevision).toBe(4);
      expect(rows[0].acdbVersionCplInfo).toBe(5);
      expect(rows[0].codecInfos).toBe('codec1,codec2');
      expect(rows[0].modifiedDate).toBe(1234567890);
      expect(rows[0].oemInfo).toBe('OEM Data');
    });

    it('updates header fields with specific values', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject(
        'PartialHeaderProject',
        'desc',
        {
          description: 'desc',
          metadata: '{}',
          fileName: 'partial.acdb',
          isTarget: true,
          openStatus: FILE_OPEN_STATUS.Loading,
          dataLossIssues: [],
        },
      );
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const fileSystemId = createResult.data.file.systemId;

      await repo.updateFileHeader(fileSystemId, {
        headerVersion: 1,
        acdbVersionMajor: 10,
        acdbVersionMinor: 20,
        acdbVersionRevision: 30,
        acdbVersionCplInfo: 40,
        codecInfos: '[]',
        modifiedDate: 1234567890,
        oemInfo: 'Partial OEM',
      });
      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const rows: Pick<
        ArcDbFileRow,
        | 'headerVersion'
        | 'acdbVersionMajor'
        | 'acdbVersionMinor'
        | 'acdbVersionRevision'
        | 'acdbVersionCplInfo'
        | 'codecInfos'
        | 'modifiedDate'
        | 'oemInfo'
      >[] = await dataSource.getRepository<ArcDbFileRow>(ArcDbFileSchema).find({
        select: [
          'headerVersion',
          'acdbVersionMajor',
          'acdbVersionMinor',
          'acdbVersionRevision',
          'acdbVersionCplInfo',
          'codecInfos',
          'modifiedDate',
          'oemInfo',
        ],
      });

      expect(rows[0].headerVersion).toBe(1);
      expect(rows[0].acdbVersionMajor).toBe(10);
      expect(rows[0].acdbVersionMinor).toBe(20);
      expect(rows[0].acdbVersionRevision).toBe(30);
      expect(rows[0].acdbVersionCplInfo).toBe(40);
      expect(rows[0].codecInfos).toBe('[]');
      expect(rows[0].modifiedDate).toBe(1234567890);
      expect(rows[0].oemInfo).toBe('Partial OEM');
    });

    it('can update header fields multiple times', async () => {
      const qr = await createTestTransaction();
      const repo = new TypeOrmProjectRepository(qr.manager);
      const createResult = await repo.createOfflineProject(
        'MultiUpdateProject',
        'desc',
        {
          description: 'desc',
          metadata: '{}',
          fileName: 'multiupdate.acdb',
          isTarget: true,
          openStatus: FILE_OPEN_STATUS.Loading,
          dataLossIssues: [],
        },
      );
      expect(createResult.kind).toBe(RESULT_KIND.Ok);
      if (createResult.kind !== RESULT_KIND.Ok) return;
      const fileSystemId = createResult.data.file.systemId;

      // First update
      await repo.updateFileHeader(fileSystemId, {
        headerVersion: 1,
        acdbVersionMajor: 1,
        acdbVersionMinor: 0,
        acdbVersionRevision: 0,
        acdbVersionCplInfo: 0,
        codecInfos: '[]',
        modifiedDate: 1000000000,
        oemInfo: 'First OEM',
      });

      // Second update
      await repo.updateFileHeader(fileSystemId, {
        headerVersion: 2,
        acdbVersionMajor: 2,
        acdbVersionMinor: 5,
        acdbVersionRevision: 10,
        acdbVersionCplInfo: 15,
        codecInfos: '[{"id":1}]',
        modifiedDate: 2000000000,
        oemInfo: 'Second OEM',
      });

      await commitTestTransaction(qr);

      const dataSource = getTestDataSource();
      const rows: Pick<
        ArcDbFileRow,
        'acdbVersionMajor' | 'acdbVersionMinor' | 'oemInfo'
      >[] = await dataSource.getRepository<ArcDbFileRow>(ArcDbFileSchema).find({
        select: ['acdbVersionMajor', 'acdbVersionMinor', 'oemInfo'],
      });

      expect(rows[0].acdbVersionMajor).toBe(2);
      expect(rows[0].acdbVersionMinor).toBe(5);
      expect(rows[0].oemInfo).toBe('Second OEM');
    });
  });
});
