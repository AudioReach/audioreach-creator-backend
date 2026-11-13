/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetTagDefinitionHandler} from '../../../../../src/application/definition/tag-definition/get-tag/get-tag-definition.handler.js';
import {GetTagDefinitionQuery} from '../../../../../src/application/definition/tag-definition/get-tag/get-tag-definition.query.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {FAILED_ENTITY_REASON} from '../../../../../src/application/ports/persistence/batch-read.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {TagDefinitionReadModel} from '../../../../../src/application/ports/persistence/query-services/tag-definition/tag-definition-read-model.js';

describe('GetTagDefinitionHandler', () => {
  const buildQueryServices = (): jest.Mocked<QueryServices> =>
    ({
      projectQueryService: {
        getFileIdByProjectId: jest.fn(),
      },
      tagDefinitionQueryService: {
        findTagDefinitions: jest.fn(),
      },
    }) as unknown as jest.Mocked<QueryServices>;

  it('resolves projectId to fileId then returns the tag definition by system id', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);

    const tag: TagDefinitionReadModel = {
      systemId: 1,
      naturalId: 100,
      name: 'MyTag',
      isVoice: false,
      keys: [],
    };
    (
      queryServices.tagDefinitionQueryService.findTagDefinitions as jest.Mock
    ).mockResolvedValue({items: [tag], failed: []});

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 1, 'client-id');

    const result = await handler.handle(query);

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.tagDefinitionQueryService.findTagDefinitions,
    ).toHaveBeenCalledWith(42, [1]);
    expect(result.data).toMatchObject({
      systemId: '1',
      naturalId: 100,
      name: 'MyTag',
    });
  });

  it('throws ResourceNotFoundException when the tag definition is not found', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.tagDefinitionQueryService.findTagDefinitions as jest.Mock
    ).mockResolvedValue({
      items: [],
      failed: [{systemId: 0x3e7, reason: FAILED_ENTITY_REASON.NotFound}],
    });

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 999, 'client-id');

    const error = await handler.handle(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResourceNotFoundException);
    expect(error).toMatchObject({
      issues: [
        {
          code: 'ENTITY_NOT_FOUND',
          message:
            'Tag with systemId: 0x000003E7 was not found in this project.',
          impactedEntity: {entityType: 'TagDefinition', systemId: 0x3e7},
        },
      ],
    });
  });

  it('throws ResourceNotFoundException naming the missing key when the tag links to one', async () => {
    const queryServices = buildQueryServices();
    (
      queryServices.projectQueryService.getFileIdByProjectId as jest.Mock
    ).mockResolvedValue(42);
    (
      queryServices.tagDefinitionQueryService.findTagDefinitions as jest.Mock
    ).mockResolvedValue({
      items: [],
      failed: [
        {
          systemId: 1,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          identity: {name: 'MyTag', naturalId: 100},
          missingRef: {entityType: 'KeyDefinition', systemId: 0x30},
        },
      ],
    });

    const handler = new GetTagDefinitionHandler(queryServices);
    const query = new GetTagDefinitionQuery(7, 1, 'client-id');

    const error = await handler.handle(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResourceNotFoundException);
    expect(error).toMatchObject({
      issues: [
        {
          code: 'ENTITY_UNRESOLVED_REFERENCE',
          message:
            "Tag 'MyTag' (0x00000064) was skipped: it references " +
            'Key with systemId: 0x00000030, which was not found in this project.',
        },
      ],
    });
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
      queryServices.tagDefinitionQueryService.findTagDefinitions,
    ).not.toHaveBeenCalled();
  });
});
