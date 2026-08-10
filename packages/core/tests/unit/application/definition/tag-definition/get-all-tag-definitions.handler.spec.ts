/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllTagDefinitionsHandler} from '../../../../../src/application/definition/tag-definition/get-all/get-all-tag-definitions.handler.js';
import {GetAllTagDefinitionsQuery} from '../../../../../src/application/definition/tag-definition/get-all/get-all-tag-definitions.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/tag-definition/tag-definition-read-model.js';

describe('GetAllTagDefinitionsHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      tagDefinitionQueryService: {
        getAllTagDefinitions: jest.fn(),
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
        tagId: 100,
        name: 'MyTag',
        isVoice: false,
        keys: [],
      },
    ];
    (
      queryServices.tagDefinitionQueryService.getAllTagDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok(tags));

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.tagDefinitionQueryService.getAllTagDefinitions,
    ).toHaveBeenCalledWith(42, undefined);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: '1',
      tagId: 100,
      name: 'MyTag',
    });
  });

  it('passes the tagId filter through to the query service', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.tagDefinitionQueryService.getAllTagDefinitions as jest.Mock
    ).mockResolvedValue(Result.ok([]));

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, 123, 'client-id');

    await handler.handle(query);

    expect(
      queryServices.tagDefinitionQueryService.getAllTagDefinitions,
    ).toHaveBeenCalledWith(42, 123);
  });

  it('forwards a partial result unchanged — does not collapse it into a failure', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const tags: TagDefinitionReadModel[] = [
      {systemId: 1, tagId: 100, name: 'GoodTag', isVoice: false, keys: []},
    ];
    const partial = Result.partial(tags, [
      {
        code: 'INTERNAL_ERROR',
        message: 'Key 2: failed to resolve values',
        severity: IssueSeverity.Error,
      },
    ]);
    (
      queryServices.tagDefinitionQueryService.getAllTagDefinitions as jest.Mock
    ).mockResolvedValue(partial);

    const handler = new GetAllTagDefinitionsHandler(queryServices);
    const query = new GetAllTagDefinitionsQuery(7, undefined, 'client-id');

    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].systemId).toBe('1');
    expect(result.issues).toHaveLength(1);
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
      queryServices.tagDefinitionQueryService.getAllTagDefinitions,
    ).not.toHaveBeenCalled();
  });
});
