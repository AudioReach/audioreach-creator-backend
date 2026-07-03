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
  Result,
  IssueSeverity,
  RESULT_KIND,
} from '@arc/core';
import type {KeyValueDefQueryService} from '@arc/core';
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
      dataSource,
      new EditActionsQueryService(dataSource),
      new DbKeyValueDefQueryService(
        dataSource,
        new EditActionsQueryService(dataSource),
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

    const result = await service.getAllTagDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([]);
  });

  it('returns tag definitions with linked key definitions and their values', async () => {
    const {fileSystemId} = await createFileDependency();

    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'MyKey',
    });
    await valueDefinitionRepository.save({
      systemId: 2,
      keySystemId: key.systemId,
      valueId: 200,
      name: 'MyValue',
    });
    const tag = await tagDefinitionRepository.save({
      systemId: 3,
      fileSystemId,
      tagId: 300,
      name: 'MyTag',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 4,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
      tagEnumValue: 'TAG_KEY_ENUM',
    });

    const result = await service.getAllTagDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: 3,
      tagId: 300,
      name: 'MyTag',
    });
    expect(result.data[0].keys).toHaveLength(1);
    expect(result.data[0].keys[0]).toMatchObject({
      cHeaderTagEnumMemberName: 'TAG_KEY_ENUM',
    });
    expect(result.data[0].keys[0].keyDefinition).toMatchObject({
      systemId: 1,
      keyId: 100,
      name: 'MyKey',
    });
    expect(result.data[0].keys[0].keyDefinition.values).toHaveLength(1);
    expect(result.data[0].keys[0].keyDefinition.values[0]).toMatchObject({
      systemId: 2,
      valueId: 200,
      name: 'MyValue',
    });
  });

  it('filters by tagId when provided', async () => {
    const {fileSystemId} = await createFileDependency();

    await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      tagId: 100,
      name: 'TagOne',
      isVoice: false,
    });
    await tagDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      tagId: 200,
      name: 'TagTwo',
      isVoice: false,
    });

    const result = await service.getAllTagDefinitions(fileSystemId, 200);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('TagTwo');
  });

  it('getTagDefinition returns null when the tag does not exist', async () => {
    const {fileSystemId} = await createFileDependency();

    const result = await service.getTagDefinition(fileSystemId, 999);

    expect(result).toBeNull();
  });

  it('getTagDefinition returns the tag with linked keys', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'MyKey',
    });
    const tag = await tagDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      tagId: 200,
      name: 'MyTag',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 3,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
    });

    const result = await service.getTagDefinition(fileSystemId, tag.systemId);

    expect(result).toMatchObject({systemId: 2, tagId: 200, name: 'MyTag'});
    expect(result?.keys).toHaveLength(1);
    expect(result?.keys[0].keyDefinition.systemId).toBe(1);
  });

  it('reflects a session UPDATE on a tag definition', async () => {
    const {fileSystemId} = await createFileDependency();
    const tag = await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      tagId: 100,
      name: 'OriginalName',
      isVoice: false,
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      systemId: tag.systemId,
      aggregateId: tag.systemId,
      sessionId: session.sessionId,
      tableName: ENTITY_NAMES.TagDefinition,
      operation: CHANGE_OPERATION.Update,
      payload: {name: 'UpdatedName'},
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const result = await service.getAllTagDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('UpdatedName');
  });

  it('excludes a tag definition deleted in the session', async () => {
    const {fileSystemId} = await createFileDependency();
    const tag = await tagDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      tagId: 100,
      name: 'ToBeDeleted',
      isVoice: false,
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      systemId: tag.systemId,
      aggregateId: tag.systemId,
      sessionId: session.sessionId,
      tableName: ENTITY_NAMES.TagDefinition,
      operation: CHANGE_OPERATION.Delete,
      payload: {systemId: tag.systemId},
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const result = await service.getAllTagDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toEqual([]);
  });

  it('excludes a link whose key definition is deleted in the session', async () => {
    const {fileSystemId} = await createFileDependency();
    const key = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'MyKey',
    });
    const tag = await tagDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      tagId: 200,
      name: 'MyTag',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 3,
      tagDefinitionSystemId: tag.systemId,
      keyReferenceSystemId: key.systemId,
    });
    const session = await createSession(fileSystemId);

    await editActionRepository.save({
      systemId: key.systemId,
      aggregateId: key.systemId,
      sessionId: session.sessionId,
      tableName: ENTITY_NAMES.KeyDefinition,
      operation: CHANGE_OPERATION.Delete,
      payload: {systemId: key.systemId},
      changeStatus: CHANGE_STATUS.Staged,
      baseVersion: null,
      groupId: null,
      validUntil: null,
    });

    const result = await service.getAllTagDefinitions(fileSystemId);

    // getKeyDefinitionsBySystemIds now reports the deleted key as a
    // per-id ENTITY_NOT_FOUND issue rather than silently omitting it —
    // the tag itself still resolves, just with the dangling link dropped.
    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].keys).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain(String(key.systemId));
  });

  it('returns a partial result when one key fails to resolve, leaving unaffected tags intact', async () => {
    const {fileSystemId} = await createFileDependency();

    const goodKey = await keyDefinitionRepository.save({
      systemId: 1,
      fileSystemId,
      keyId: 100,
      name: 'GoodKey',
    });
    await valueDefinitionRepository.save({
      systemId: 10,
      keySystemId: goodKey.systemId,
      valueId: 1000,
      name: 'GoodValue',
    });
    const badKey = await keyDefinitionRepository.save({
      systemId: 2,
      fileSystemId,
      keyId: 200,
      name: 'BadKey',
    });

    const goodTag = await tagDefinitionRepository.save({
      systemId: 3,
      fileSystemId,
      tagId: 300,
      name: 'TagOnGoodKey',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 4,
      tagDefinitionSystemId: goodTag.systemId,
      keyReferenceSystemId: goodKey.systemId,
      tagEnumValue: 'GOOD_TAG_KEY_ENUM',
    });

    const badTag = await tagDefinitionRepository.save({
      systemId: 5,
      fileSystemId,
      tagId: 400,
      name: 'TagOnBadKey',
      isVoice: false,
    });
    await tagKeyDefLinkRepository.save({
      systemId: 6,
      tagDefinitionSystemId: badTag.systemId,
      keyReferenceSystemId: badKey.systemId,
      tagEnumValue: 'BAD_TAG_KEY_ENUM',
    });

    // Stub KeyValueDefQueryService: fails only for badKey's systemId (via the
    // real service's own partial-result path), succeeds for every other key —
    // isolates the tag-level partial-result propagation without needing a
    // real DB error. Only getKeyDefinitionsBySystemIds is implemented — it's
    // the only method overlayTagDefinitionRows calls on this dependency
    // post-Task-3 (scoped to the tags' linked keys, not the whole file).
    const realKeyValueDefSvc = new DbKeyValueDefQueryService(
      dataSource,
      new EditActionsQueryService(dataSource),
    );
    const stubKeyValueDefSvc: Pick<
      KeyValueDefQueryService,
      'getKeyDefinitionsBySystemIds'
    > = {
      async getKeyDefinitionsBySystemIds(keySystemIds, fsId) {
        const result = await realKeyValueDefSvc.getKeyDefinitionsBySystemIds(
          keySystemIds,
          fsId,
        );
        if (result.kind === RESULT_KIND.Fail) return result;
        const data = result.data.filter(k => k.systemId !== badKey.systemId);
        return Result.partial(data, [
          {
            code: 'INTERNAL_ERROR',
            message: 'Simulated failure for BadKey',
            severity: IssueSeverity.Error,
          },
        ]);
      },
    };

    const serviceWithStub = new DbTagDefinitionQueryService(
      dataSource,
      new EditActionsQueryService(dataSource),
      stubKeyValueDefSvc as KeyValueDefQueryService,
    );

    const result = await serviceWithStub.getAllTagDefinitions(fileSystemId);

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('BadKey');

    // TagOnGoodKey survives with its key resolved
    const goodTagResult = result.data.find(
      t => t.systemId === goodTag.systemId,
    );
    expect(goodTagResult).toMatchObject({systemId: 3, name: 'TagOnGoodKey'});
    expect(goodTagResult?.keys).toHaveLength(1);
    expect(goodTagResult?.keys[0].keyDefinition).toMatchObject({
      systemId: 1,
      name: 'GoodKey',
    });

    // TagOnBadKey survives too, but its link to the failed key is dropped —
    // same "link whose key resolves to nothing" handling as a session-deleted key.
    const badTagResult = result.data.find(t => t.systemId === badTag.systemId);
    expect(badTagResult).toMatchObject({systemId: 5, name: 'TagOnBadKey'});
    expect(badTagResult?.keys).toEqual([]);
  });

  it('scopes key resolution to only the keys a tag references, not the whole file', async () => {
    const {fileSystemId} = await createFileDependency();

    // 500 keys in the file, only 3 of them referenced by the tag under test.
    const keys = await Promise.all(
      Array.from({length: 500}, (_, i) =>
        keyDefinitionRepository.save({
          systemId: i + 1,
          fileSystemId,
          keyId: 100 + i,
          name: `Key${i}`,
        }),
      ),
    );

    const tag = await tagDefinitionRepository.save({
      systemId: 1000,
      fileSystemId,
      tagId: 900,
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

    // Spy on getKeyDefinitionsBySystemIds to confirm it's called with only
    // the 3 linked keys, not all 500 in the file.
    const spy = jest.spyOn(
      DbKeyValueDefQueryService.prototype,
      'getKeyDefinitionsBySystemIds',
    );

    try {
      const result = await service.getAllTagDefinitions(
        fileSystemId,
        tag.tagId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].keys).toHaveLength(3);

      expect(spy).toHaveBeenCalledTimes(1);
      const [calledIds] = spy.mock.calls[0];
      expect(calledIds).toHaveLength(3);
      expect(new Set(calledIds)).toEqual(
        new Set(linkedKeys.map(k => k.systemId)),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
