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
import {Repository} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {
  EditActionSchema,
  type EditActionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  type ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  ProjectSchema,
  type ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  type ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {editActionTargetKeyString} from '../../../../src/persistence-typeorm-sqllite/services/pending-target-reducer.js';

describe('EditActionsQueryService integration', () => {
  let service: EditActionsQueryService;
  let editActionRepo: Repository<EditActionRow>;
  let projectSessionRepo: Repository<ProjectSessionRow>;
  let projectRepo: Repository<ProjectRow>;
  let arcDbFileRepo: Repository<ArcDbFileRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    service = new EditActionsQueryService(ds.manager);
    editActionRepo = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepo =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(): Promise<{fileSystemId: number}> {
    const project = await projectRepo.save({
      name: 'Test Project',
      description: 'Test',
      type: 'Offline',
    });
    const file = await arcDbFileRepo.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepo.save({
      fileSystemId,
      userId: 'test-user',
      clientId: 'test-client',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  async function insertRow(
    partial: Partial<EditActionRow> & {
      targetSystemId: number;
      targetTable: string;
      sessionId: number;
      aggregateId: number;
    },
  ): Promise<EditActionRow> {
    return editActionRepo.save({
      fieldPath: null,
      newValue: {value: 1},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      operation: CHANGE_OPERATION.Update,
      linkedEntityGroupId: null,
      ...partial,
    } as unknown as EditActionRow);
  }

  describe('getByAggregateId', () => {
    it('returns current rows for an aggregate', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 101,
        targetTable: ENTITY_NAMES.SpfModule,
      });
      const rows = await service.getByAggregateId(session.sessionId, 10);

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(101);
    });

    it('returns empty array when session has no active rows for aggregate', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);
      const rows = await service.getByAggregateId(session.sessionId, 99);
      expect(rows).toEqual([]);
    });
  });

  describe('getByAggregateAndTable', () => {
    it('filters by aggregateId and targetTable', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 201,
        targetTable: ENTITY_NAMES.SpfModule,
      });
      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 202,
        targetTable: ENTITY_NAMES.DataLink,
      });

      const rows = await service.getByAggregateAndTable(
        session.sessionId,
        10,
        ENTITY_NAMES.SpfModule,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(201);
    });
  });

  describe('getByTable', () => {
    it('returns current rows scoped to targetTable', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 301,
        targetTable: ENTITY_NAMES.SpfModule,
      });
      const rows = await service.getByTable(
        session.sessionId,
        ENTITY_NAMES.SpfModule,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(301);
    });
  });

  describe('getBySource', () => {
    it('returns only rows matching the requested source', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 401,
        targetTable: ENTITY_NAMES.SpfModule,
        source: SOURCE.Manual,
      });
      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 402,
        targetTable: ENTITY_NAMES.SpfModule,
        source: SOURCE.AutoRouting,
      });

      const rows = await service.getBySource(
        session.sessionId,
        SOURCE.AutoRouting,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(402);
    });
  });

  describe('options filtering', () => {
    it('filters by changeStatus', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 501,
        targetTable: ENTITY_NAMES.SpfModule,
        changeStatus: CHANGE_STATUS.Staged,
      });
      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 502,
        targetTable: ENTITY_NAMES.SpfModule,
        changeStatus: CHANGE_STATUS.Unstaged,
      });

      const rows = await service.getByAggregateId(session.sessionId, 10, {
        changeStatus: CHANGE_STATUS.Staged,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(501);
    });

    it('filters by source via options', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 601,
        targetTable: ENTITY_NAMES.SpfModule,
        source: SOURCE.Manual,
      });
      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 602,
        targetTable: ENTITY_NAMES.SpfModule,
        source: SOURCE.DiffTool,
      });

      const rows = await service.getByAggregateId(session.sessionId, 10, {
        source: SOURCE.DiffTool,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(602);
    });

    it('filters by operations', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 701,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Create,
      });
      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 702,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Update,
      });

      const rows = await service.getByAggregateId(session.sessionId, 10, {
        operations: [CHANGE_OPERATION.Create],
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].targetSystemId).toBe(701);
    });
  });

  describe('findCurrentRow', () => {
    it('returns null when no active row exists for the slot', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);
      const row = await service.findCurrentRow(
        session.sessionId,
        999,
        ENTITY_NAMES.SpfModule,
        'alias',
      );
      expect(row).toBeNull();
    });

    it('returns the current row matching sessionId, targetSystemId, and fieldPath', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 801,
        targetTable: ENTITY_NAMES.SpfModule,
        fieldPath: 'alias',
      });

      const row = await service.findCurrentRow(
        session.sessionId,
        801,
        ENTITY_NAMES.SpfModule,
        'alias',
      );
      expect(row).not.toBeNull();
      expect(row!.targetSystemId).toBe(801);
      expect(row!.fieldPath).toBe('alias');
    });

    it('returns the active row when fieldPath is null (accumulator slot)', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      await insertRow({
        sessionId: session.sessionId,
        aggregateId: 10,
        targetSystemId: 902,
        targetTable: ENTITY_NAMES.SpfModule,
        fieldPath: null,
      });

      const row = await service.findCurrentRow(
        session.sessionId,
        902,
        ENTITY_NAMES.SpfModule,
        null,
      );
      expect(row).not.toBeNull();
      expect(row!.fieldPath).toBeNull();
    });
  });

  describe('target loaders', () => {
    it('returns every current slot for exactly one target', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);
      const target = {
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 1101,
      } as const;

      await insertRow({...target, aggregateId: 10, fieldPath: 'alias'});
      await insertRow({
        ...target,
        aggregateId: 10,
        fieldPath: 'containerSystemId',
        newValue: {containerSystemId: 8},
      });

      const rows = await service.getAllByTargetKey(
        target,
        getTestDataSource().manager,
      );
      expect(rows.map(row => row.fieldPath)).toEqual([
        'alias',
        'containerSystemId',
      ]);
    });

    it('returns an entry for every requested target and separates tables', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);
      const moduleTarget = {
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 1102,
      } as const;
      const containerTarget = {
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.Container,
        targetSystemId: 1102,
      } as const;
      const emptyTarget = {
        sessionId: session.sessionId,
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: 1103,
      } as const;

      await insertRow({...moduleTarget, aggregateId: 10});
      await insertRow({...containerTarget, aggregateId: 10});

      const rowsByTarget = await service.getAllByTargetKeys(
        [moduleTarget, containerTarget, emptyTarget],
        getTestDataSource().manager,
      );

      expect(
        rowsByTarget.get(editActionTargetKeyString(moduleTarget)),
      ).toHaveLength(1);
      expect(
        rowsByTarget.get(editActionTargetKeyString(containerTarget)),
      ).toHaveLength(1);
      expect(rowsByTarget.get(editActionTargetKeyString(emptyTarget))).toEqual(
        [],
      );
      expect(
        rowsByTarget.get(editActionTargetKeyString(containerTarget))?.[0]
          .targetTable,
      ).toBe(ENTITY_NAMES.Container);
    });
  });

  describe('queryRunner parameter', () => {
    it('uses the provided QueryRunner when supplied', async () => {
      const {fileSystemId} = await createFileDependency();
      const session = await createSession(fileSystemId);

      const ds = getTestDataSource();
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.manager.getRepository(EditActionSchema).save({
          sessionId: session.sessionId,
          aggregateId: 10,
          targetSystemId: 1001,
          targetTable: ENTITY_NAMES.SpfModule,
          fieldPath: null,
          newValue: {value: 1},
          source: SOURCE.Manual,
          changeStatus: CHANGE_STATUS.Staged,
          operation: CHANGE_OPERATION.Update,
          linkedEntityGroupId: null,
        });
        const rows = await new EditActionsQueryService(
          qr.manager,
        ).getByAggregateId(session.sessionId, 10);
        expect(rows).toHaveLength(1);
      } finally {
        await qr.rollbackTransaction();
        await qr.release();
      }
    });
  });
});
