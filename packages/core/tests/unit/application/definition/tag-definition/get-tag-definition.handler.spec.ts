/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetTagDefinitionHandler} from '../../../../../src/application/definition/tag-definition/get-tag/get-tag-definition.handler.js';
import {GetTagDefinitionQuery} from '../../../../../src/application/definition/tag-definition/get-tag/get-tag-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/tag-definition/tag-definition-read-model.js';

describe('GetTagDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      tagDefinitionQueryService: {
        getTagDefinition: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the tag definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const tag: TagDefinitionReadModel = {
      systemId: 1,
      tagId: 100,
      name: 'MyTag',
      isVoice: false,
      keys: [],
    };
    (
      queryServices.tagDefinitionQueryService.getTagDefinition as jest.Mock
    ).mockResolvedValue(tag);

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.tagDefinitionQueryService.getTagDefinition,
    ).toHaveBeenCalledWith(42, 1);
    expect(result).toBe(tag);
  });

  it('throws ResourceNotFoundException when the tag definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.tagDefinitionQueryService.getTagDefinition as jest.Mock
    ).mockResolvedValue(null);

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 999, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('propagates a rejection from getFileIdByProjectId', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockRejectedValue(new Error('Project not found'));

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 1, 'client-id');

    await expect(handler.handle(query)).rejects.toThrow('Project not found');
    expect(
      queryServices.tagDefinitionQueryService.getTagDefinition,
    ).not.toHaveBeenCalled();
  });
});
