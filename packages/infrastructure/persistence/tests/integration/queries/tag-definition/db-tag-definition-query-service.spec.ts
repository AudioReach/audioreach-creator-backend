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
  jest,
} from '@jest/globals';
import {Repository, DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  FAILED_ENTITY_REASON,
  SOURCE,
} from '@arc/core';
import {DbTagDefinitionQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/tag-definition/db-tag-definition-query-service.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  TagDefinitionSchema,
  TagDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import {
  TagKeyDefLinkSchema,
  TagKeyDefLinkRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';
import {
  KeyDefinitionSchema,
  KeyDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {
  ValueDefinitionSchema,
  ValueDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  EditActionSchema,
  EditActionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';

describe('DbTagDefinitionQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let tagDefinitionRepository: Repository<TagDefinitionRow>;
  let tagKeyDefLinkRepository: Repository<TagKeyDefLinkRow>;
  let keyDefinitionRepository: Repository<KeyDefinitionRow>;
  let valueDefinitionRepository: Repository<ValueDefinitionRow>;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let service: DbTagDefinitionQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    tagDefinitionRepository =
      getTestRepository<TagDefinitionRow>(TagDefinitionSchema);
    tagKeyDefLinkRepository =
      getTestRepository<TagKeyDefLinkRow>(TagKeyDefLinkSchema);
    keyDefinitionRepository =
      getTestRepository<KeyDefinitionRow>(KeyDefinitionSchema);
    valueDefinitionRepository = getTestRepository<ValueDefinitionRow>(
      ValueDefinitionSchema,
    );
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    service = new DbTagDefinitionQueryService(
      dataSource.manager,
      new EditActionsQueryService(dataSource.manager),
      new DbKeyValueDefQueryService(
        dataSource.manager,
        new EditActionsQueryService(dataSource.manager),
      ),
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(): Promise<{fileSystemId: number}> {
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
      lastReservedId: 0,
    });

    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepository.save({
      fileSystemId,
      userId: 'test-user-123',
      clientId: 'test-client-456',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  it('returns an empty array when the file has no tag definitions', async () => {
    const {fileSystemId} = await createFileDependency();

    const result = await service.findAllTagDefinitions(fileSystemId);

    expect(result.failed).toEqual([]);
    expect(result.items).toEqual([]);
  });

  it('returns tag definitions with linked key definitions and their values', async () => {
    const {fileSystemId} = await createFileDependency();

    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'MyKey',
    });
    await valueDefinitionRepository.save({
      systemId: 2,
      keySystemId: key.systemId,
      naturalId: 200,
      name: 'MyValue',
    });
    const tag = await tagDefinitionRepository.save({
      systemId: 3,
      fileSystemId,
      naturalId: 300,
      name: 'MyTag',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 4,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
      tagEnumValue: 'TAG_KEY_ENUM',
    });

    const result = await service.findAllTagDefinitions(fileSystemId);

    expect(result.failed).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      systemId: 3,
      naturalId: 300,
      name: 'MyTag',
    });
    expect(result.items[0].keys).toHaveLength(1);
    expect(result.items[0].keys[0]).toMatchObject({
      cHeaderTagEnumMemberName: 'TAG_KEY_ENUM',
    });
    expect(result.items[0].keys[0].keyDefinition).toMatchObject({
      systemId: 1,
      naturalId: 100,
      name: 'MyKey',
    });
    expect(result.items[0].keys[0].keyDefinition.values).toHaveLength(1);
    expect(result.items[0].keys[0].keyDefinition.values[0]).toMatchObject({
      systemId: 2,
      naturalId: 200,
      name: 'MyValue',
    });
  });

  it('filters by natural ID when provided', async () => {
    const {fileSystemId} = await createFileDependency();

    await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'TagOne',
      isVoice: false,
    });
    await tagDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      naturalId: 200,
      name: 'TagTwo',
      isVoice: false,
    });

    const result = await service.findAllTagDefinitions(fileSystemId, {
      naturalId: 200,
    });

    expect(result.failed).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('TagTwo');
  });

  it('findTagDefinitions reports a missing tag as not found', async () => {
    const {fileSystemId} = await createFileDependency();

    const result = await service.findTagDefinitions(fileSystemId, [999]);

    expect(result).toEqual({
      items: [],
      failed: [{systemId: 999, reason: FAILED_ENTITY_REASON.NotFound}],
    });
  });

  it('findTagDefinitions returns the tag with linked keys', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'MyKey',
    });
    const tag = await tagDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      naturalId: 200,
      name: 'MyTag',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 3,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
    });

    const result = await service.findTagDefinitions(fileSystemId, [
      tag.systemId,
    ]);

    expect(result.failed).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      systemId: 2,
      naturalId: 200,
      name: 'MyTag',
    });
    expect(result.items[0].keys[0].keyDefinition.systemId).toBe(1);
  });

  it('reflects a session UPDATE on a tag definition', async () => {
    const {fileSystemId} = await createFileDependency();
    const tag = await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'OriginalName',
      isVoice: false,
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      targetSystemId: tag.systemId,
      aggregateId: tag.systemId,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.TagDefinition,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue: {name: 'UpdatedName'},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const result = await service.findAllTagDefinitions(fileSystemId);

    expect(result.failed).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('UpdatedName');
  });

  it('excludes a tag definition deleted in the session', async () => {
    const {fileSystemId} = await createFileDependency();
    const tag = await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      naturalId: 100,
      name: 'ToBeDeleted',
      isVoice: false,
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      targetSystemId: tag.systemId,
      aggregateId: tag.systemId,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.TagDefinition,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: '$',
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const result = await service.findAllTagDefinitions(fileSystemId);

    expect(result.failed).toEqual([]);
    expect(result.items).toEqual([]);
  });

  it('reports a tag whose linked key was deleted in the session as an unresolved reference, keeping other tags', async () => {
    const {fileSystemId} = await createFileDependency();
    await keyDefinitionRepository.save([
      {systemId: 1, fileSystemId, naturalId: 100, name: 'GoodKey'},
      {systemId: 2, fileSystemId, naturalId: 200, name: 'DeletedKey'},
    ]);
    await tagDefinitionRepository.save([
      {
        systemId: 3,
        fileSystemId,
        naturalId: 300,
        name: 'GoodTag',
        isVoice: false,
      },
      {
        systemId: 5,
        fileSystemId,
        naturalId: 0x400,
        name: 'BrokenTag',
        isVoice: false,
      },
    ]);
    await tagKeyDefLinkRepository.save([
      {systemId: 4, tagDefinitionSystemId: 3, keyReferenceSystemId: 1},
      {systemId: 6, tagDefinitionSystemId: 5, keyReferenceSystemId: 2},
    ]);
    const session = await createSession(fileSystemId);
    await editActionRepository.save({
      targetSystemId: 2,
      aggregateId: 2,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: '$',
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });

    const result = await service.findAllTagDefinitions(fileSystemId);

    expect(result.items.map(tag => tag.name)).toEqual(['GoodTag']);
    expect(result.items[0].keys[0].keyDefinition.name).toBe('GoodKey');
    expect(result.failed).toEqual([
      {
        systemId: 5,
        reason: FAILED_ENTITY_REASON.UnresolvedReference,
        identity: {name: 'BrokenTag', naturalId: 0x400},
        missingRef: {entityType: 'KeyDefinition', systemId: 2},
      },
    ]);
  });

  it('scopes key resolution to only the keys a tag references, not the whole file', async () => {
    const {fileSystemId} = await createFileDependency();

    // 500 keys in the file, only 3 of them referenced by the tag under test.
    const keys = await Promise.all(
      Array.from({length: 500}, (_, i) =>
        keyDefinitionRepository.save({
          systemId: i + 1,
          fileSystemId,
          naturalId: 100 + i,
          name: `Key${i}`,
        }),
      ),
    );

    const tag = await tagDefinitionRepository.save({
      systemId: 1000,
      fileSystemId,
      naturalId: 900,
      name: 'ScopedTag',
      isVoice: false,
    });
    const linkedKeys = keys.slice(0, 3);
    await Promise.all(
      linkedKeys.map((key, i) =>
        tagKeyDefLinkRepository.save({
          systemId: 2000 + i,
          tagDefinitionSystemId: tag.systemId,
          keyReferenceSystemId: key.systemId,
        }),
      ),
    );

    // Spy on findKeyDefinitions to confirm it's called with only
    // the 3 linked keys, not all 500 in the file.
    const spy = jest.spyOn(
      DbKeyValueDefQueryService.prototype,
      'findKeyDefinitions',
    );

    try {
      const result = await service.findAllTagDefinitions(fileSystemId, {
        naturalId: tag.naturalId,
      });

      expect(result.failed).toEqual([]);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].keys).toHaveLength(3);

      expect(spy).toHaveBeenCalledTimes(1);
      const [, calledIds] = spy.mock.calls[0];
      expect(calledIds).toHaveLength(3);
      expect(new Set(calledIds)).toEqual(
        new Set(linkedKeys.map(k => k.systemId)),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
