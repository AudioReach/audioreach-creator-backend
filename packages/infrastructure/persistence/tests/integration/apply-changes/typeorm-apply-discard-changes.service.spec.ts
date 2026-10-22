/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, SESSION_MODE, SOURCE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {EditActionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {SessionCommitSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/session-commit.schema.js';
import {
  UseCaseSchema,
  UsecaseGkvValuesSchema,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/use-case.js';
import {KeyDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {ValueDefinitionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ApplyEditActionReducer} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-edit-action-reducer.js';
import {TypeOrmApplyChangesService} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-apply-changes.service.js';
import {TypeOrmDiscardChangesService} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-discard-changes.service.js';
import {TypeOrmSessionRepository} from '../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';

describe('TypeOrm apply/discard changes services', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  async function seedSession() {
    const dataSource = getTestDataSource();
    await dataSource.getRepository(ProjectSchema).save({
      systemId: 1,
      name: 'apply-project',
      description: '',
      type: 'Offline',
    });
    await dataSource.getRepository(ArcDbFileSchema).save({
      systemId: 10,
      projectSystemId: 1,
      fileName: 'apply.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    await dataSource.getRepository(KeyDefinitionSchema).save({
      systemId: 20,
      fileSystemId: 10,
      naturalId: 20,
      name: 'apply-key',
    });
    await dataSource.getRepository(ValueDefinitionSchema).save([
      {
        systemId: 31,
        keySystemId: 20,
        naturalId: 31,
        name: 'apply-value-31',
      },
      {
        systemId: 32,
        keySystemId: 20,
        naturalId: 32,
        name: 'apply-value-32',
      },
    ]);
    const session = await dataSource.getRepository(ProjectSessionSchema).save({
      fileSystemId: 10,
      clientId: 'apply-client',
      userId: null,
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    return {dataSource, session};
  }

  it('applies staged rows and preserves unstaged rows', async () => {
    const {dataSource, session} = await seedSession();
    const editActions = dataSource.getRepository(EditActionSchema);
    await editActions.insert([
      {
        sessionId: session.sessionId,
        aggregateId: 100,
        targetSystemId: 100,
        targetTable: ENTITY_NAMES.UseCase,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {
          aliasId: 1,
          alias: 'committed',
          type: null,
          fileSystemId: 10,
        },
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      },
      {
        sessionId: session.sessionId,
        aggregateId: 100,
        targetSystemId: 1001,
        targetTable: ENTITY_NAMES.UsecaseGkvValues,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {usecaseSystemId: 100, valueDefSystemId: 31},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      },
      {
        sessionId: session.sessionId,
        aggregateId: 100,
        targetSystemId: 1002,
        targetTable: ENTITY_NAMES.UsecaseGkvValues,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {usecaseSystemId: 100, valueDefSystemId: 32},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
        linkedEntityGroupId: null,
      },
      {
        sessionId: session.sessionId,
        aggregateId: 101,
        targetSystemId: 101,
        targetTable: ENTITY_NAMES.UseCase,
        operation: CHANGE_OPERATION.Create,
        fieldPath: '$',
        newValue: {
          aliasId: 2,
          alias: 'pending',
          type: null,
          fileSystemId: 10,
        },
        source: SOURCE.AutoRouting,
        changeStatus: CHANGE_STATUS.Unstaged,
        linkedEntityGroupId: null,
      },
    ]);

    const manager = dataSource.manager;
    const context = {
      session: {
        sessionId: session.sessionId,
        mode: SESSION_MODE.Designer,
        fileSystemId: 10,
        projectId: '1',
      },
      groupId: 'apply-group',
    };
    await new TypeOrmApplyChangesService(
      context,
      manager,
      new EditActionsQueryService(manager),
      new ApplyEditActionReducer(manager),
      new TypeOrmSessionRepository(manager),
    ).apply();

    expect(
      await manager.getRepository(UseCaseSchema).findOneBy({systemId: 100}),
    ).toEqual(expect.objectContaining({alias: 'committed'}));
    const gkvRows = await manager
      .getRepository(UsecaseGkvValuesSchema)
      .find({where: {usecaseSystemId: 100}});
    expect(gkvRows).toHaveLength(2);
    expect(gkvRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemId: 1001,
          usecaseSystemId: 100,
          valueDefSystemId: 31,
        }),
        expect.objectContaining({
          systemId: 1002,
          usecaseSystemId: 100,
          valueDefSystemId: 32,
        }),
      ]),
    );
    expect(await editActions.find()).toEqual([
      expect.objectContaining({
        targetSystemId: 101,
        changeStatus: CHANGE_STATUS.Unstaged,
      }),
    ]);
    expect(await manager.getRepository(SessionCommitSchema).count()).toBe(0);
  });

  it('rejects an empty staged selection and discard clears every status', async () => {
    const {dataSource, session} = await seedSession();
    const manager = dataSource.manager;
    const context = {
      session: {
        sessionId: session.sessionId,
        mode: SESSION_MODE.Designer,
        fileSystemId: 10,
        projectId: '1',
      },
      groupId: 'apply-group',
    };
    const sessionRepository = new TypeOrmSessionRepository(manager);
    const apply = new TypeOrmApplyChangesService(
      context,
      manager,
      new EditActionsQueryService(manager),
      new ApplyEditActionReducer(manager),
      sessionRepository,
    );
    await expect(apply.apply()).rejects.toMatchObject({
      errorCode: 'NO_STAGED_CHANGES',
    });

    await manager.getRepository(EditActionSchema).insert({
      sessionId: session.sessionId,
      aggregateId: 100,
      targetSystemId: 100,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {alias: 'pending'},
      source: SOURCE.AutoRouting,
      changeStatus: CHANGE_STATUS.Unstaged,
      linkedEntityGroupId: null,
    });
    await new TypeOrmDiscardChangesService(
      context,
      sessionRepository,
    ).discard();

    expect(await manager.getRepository(EditActionSchema).count()).toBe(0);
  });

  it('deletes UseCase GKV rows through the parent cascade', async () => {
    const {dataSource, session} = await seedSession();
    const manager = dataSource.manager;
    await manager.getRepository(UseCaseSchema).save({
      systemId: 100,
      aliasId: 1,
      alias: 'committed',
      type: null,
      fileSystemId: 10,
    });
    await manager.getRepository(UsecaseGkvValuesSchema).save({
      systemId: 1001,
      usecaseSystemId: 100,
      valueDefSystemId: 31,
    });
    await manager.getRepository(EditActionSchema).insert({
      sessionId: session.sessionId,
      aggregateId: 100,
      targetSystemId: 100,
      targetTable: ENTITY_NAMES.UseCase,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: null,
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    await new TypeOrmApplyChangesService(
      {
        session: {
          sessionId: session.sessionId,
          mode: SESSION_MODE.Designer,
          fileSystemId: 10,
          projectId: '1',
        },
        groupId: 'apply-group',
      },
      manager,
      new EditActionsQueryService(manager),
      new ApplyEditActionReducer(manager),
      new TypeOrmSessionRepository(manager),
    ).apply();

    expect(await manager.getRepository(UseCaseSchema).count()).toBe(0);
    expect(await manager.getRepository(UsecaseGkvValuesSchema).count()).toBe(0);
  });
});
