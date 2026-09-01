/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
} from '@jest/globals';
import {DataSource, Repository} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  KeyDefinitionSchema,
  type KeyDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {
  ValueDefinitionSchema,
  type ValueDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {
  ProjectSchema,
  type ProjectRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  type ArcDbFileRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  EditActionSchema,
  type EditActionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  type ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {KeyValueDefinitionFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {ValueDefinitionFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/definitions/key-value/value-definition-fetcher.js';

describe('Key/value definition fetchers', () => {
  let dataSource: DataSource;
  let keyRepository: Repository<KeyDefinitionRow>;
  let valueRepository: Repository<ValueDefinitionRow>;
  let projectRepository: Repository<ProjectRow>;
  let fileRepository: Repository<ArcDbFileRow>;
  let sessionRepository: Repository<ProjectSessionRow>;
  let editActionRepository: Repository<EditActionRow>;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    keyRepository = getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    sessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFile(): Promise<number> {
    const project = await projectRepository.save({
      name: 'Fetcher Test Project',
      description: 'Fetcher test',
      type: 'Offline',
    });
    const file = await fileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'fetcher-test.acdb',
      description: 'Fetcher test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });
    return file.systemId;
  }

  async function createSession(fileSystemId: number): Promise<number> {
    const session = await sessionRepository.save({
      fileSystemId,
      userId: 'fetcher-user',
      clientId: 'fetcher-client',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    return session.sessionId;
  }

  function createFetchers() {
    const editActions = new EditActionsQueryService(dataSource.manager);
    const valueFetcher = new ValueDefinitionFetcher(
      dataSource.manager,
      editActions,
    );
    const keyFetcher = new KeyValueDefinitionFetcher(
      dataSource.manager,
      editActions,
      valueFetcher,
    );
    return {keyFetcher, valueFetcher};
  }

  it('applies the restricted key and value filters', async () => {
    const fileSystemId = await createFile();
    const keyOne = await keyRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'KeyOne',
      description: 'First key',
      isCalibrationKey: true,
      isGraphKey: false,
      isVoice: false,
      isDynamic: false,
    });
    await keyRepository.save({
      systemId: 2,
      fileSystemId,
      keyId: 200,
      name: 'KeyTwo',
    });
    await valueRepository.save({
      systemId: 11,
      keySystemId: keyOne.systemId,
      valueId: 101,
      name: 'ValueOne',
    });
    await valueRepository.save({
      systemId: 12,
      keySystemId: keyOne.systemId,
      valueId: 102,
      name: 'ValueTwo',
    });

    const {keyFetcher, valueFetcher} = createFetchers();
    const keys = await keyFetcher.fetchMany('all', fileSystemId, null, {
      name: 'KeyOne',
      isCalibrationKey: true,
    });
    const values = await valueFetcher.fetchMany('all', null, {
      keySystemId: keyOne.systemId,
      valueId: 102,
      name: 'ValueTwo',
    });

    expect(keys).toHaveLength(1);
    expect(keys[0].values).toHaveLength(2);
    expect(values).toHaveLength(1);
    expect(values[0].systemId).toBe(12);
  });

  it('includes filtered session CREATE plus UPDATE rows and delegates fetchOne', async () => {
    const fileSystemId = await createFile();
    const sessionId = await createSession(fileSystemId);
    const keySystemId = 100;
    const valueSystemId = 101;

    await editActionRepository.save({
      targetSystemId: keySystemId,
      aggregateId: keySystemId,
      sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {
        fileSystemId,
        keyId: 500,
        name: 'CreatedKey',
        isCalibrationKey: true,
        isGraphKey: false,
        isVoice: false,
        isDynamic: false,
      },
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });
    await editActionRepository.save({
      targetSystemId: keySystemId,
      aggregateId: keySystemId,
      sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {name: 'UpdatedCreatedKey'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });
    await editActionRepository.save({
      targetSystemId: valueSystemId,
      aggregateId: keySystemId,
      sessionId,
      targetTable: ENTITY_NAMES.ValueDefinition,
      operation: CHANGE_OPERATION.Create,
      fieldPath: '$',
      newValue: {
        keySystemId,
        valueId: 600,
        name: 'CreatedValue',
      },
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });
    await editActionRepository.save({
      targetSystemId: valueSystemId,
      aggregateId: keySystemId,
      sessionId,
      targetTable: ENTITY_NAMES.ValueDefinition,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {name: 'UpdatedCreatedValue'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });

    const {keyFetcher, valueFetcher} = createFetchers();
    const many = await keyFetcher.fetchMany('all', fileSystemId, sessionId, {
      isCalibrationKey: true,
    });
    const one = await keyFetcher.fetchOne(keySystemId, fileSystemId, sessionId);
    const filteredValues = await valueFetcher.fetchMany('all', sessionId, {
      keySystemId,
      valueId: 600,
    });

    expect(many).toHaveLength(1);
    expect(many[0].systemId).toBe(keySystemId);
    expect(many[0].values[0].name).toBe('UpdatedCreatedValue');
    expect(one).toEqual(many[0]);
    expect(filteredValues).toHaveLength(1);
  });
});
