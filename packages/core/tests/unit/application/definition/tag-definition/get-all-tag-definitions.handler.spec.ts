/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllTagDefinitionsHandler} from '../../../../../src/application/definition/tag-definition/get-all/get-all-tag-definitions.handler.js';
import {GetAllTagDefinitionsQuery} from '../../../../../src/application/definition/tag-definition/get-all/get-all-tag-definitions.query.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {FAILED_ENTITY_REASON} from '../../../../../src/application/ports/persistence/batch-read.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/tag-definition/tag-definition-read-model.js';

describe('GetAllTagDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      tagDefinitionQueryService: {
        findAllTagDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then lists tag definitions for that file', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const tags: TagDefinitionReadModel[] = [
      {
        systemId: 1,
        naturalId: 100,
        name: 'MyTag',
        isVoice: false,
        keys: [],
      },
    ];
    (
      queryServices.tagDefinitionQueryService.findAllTagDefinitions as jest.Mock
    ).mockResolvedValue({items: tags, failed: []});

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.tagDefinitionQueryService.findAllTagDefinitions,
    ).toHaveBeenCalledWith(42, {naturalId: undefined});
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: '1',
      naturalId: 100,
      name: 'MyTag',
    });
  });

  it('passes the tagId filter through to the query service', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.tagDefinitionQueryService.findAllTagDefinitions as jest.Mock
    ).mockResolvedValue({items: [], failed: []});

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, 123, 'client-id');

    await handler.handle(query);

    expect(
      queryServices.tagDefinitionQueryService.findAllTagDefinitions,
    ).toHaveBeenCalledWith(42, {naturalId: 123});
  });

  it('returns a partial result naming each tag that links to a missing key', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const tags: TagDefinitionReadModel[] = [
      {systemId: 1, naturalId: 100, name: 'GoodTag', isVoice: false, keys: []},
    ];
    (
      queryServices.tagDefinitionQueryService.findAllTagDefinitions as jest.Mock
    ).mockResolvedValue({
      items: tags,
      failed: [
        {
          systemId: 2,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          identity: {name: 'BrokenTag', naturalId: 0x200},
          missingRef: {entityType: 'KeyDefinition', systemId: 0x30},
        },
      ],
    });

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data.map(tag => tag.systemId)).toEqual(['1']);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ENTITY_UNRESOLVED_REFERENCE',
        message:
          "Tag 'BrokenTag' (0x00000200) was skipped: it references " +
          'Key with systemId: 0x00000030, which was not found in this project.',
        impactedEntity: expect.objectContaining({
          entityType: 'TagDefinition',
          systemId: 2,
        }),
      }),
    ]);
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, undefined, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.tagDefinitionQueryService.findAllTagDefinitions,
    ).not.toHaveBeenCalled();
  });
});
