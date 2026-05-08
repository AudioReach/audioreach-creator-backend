/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  FILE_OPEN_STATUS,
  type ValidationIssue,
  IssueCategory,
  IssueSeverity,
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

        expect(result.success).toBe(true);
        if (!result.success) return;

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
      expect(first.success).toBe(true);
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

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.errorMessage).toBeTruthy();
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
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;
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
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;
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
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;
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
});
