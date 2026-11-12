/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import {GetDataLinksByModulePortHandler} from '../../../../../../src/application/usecase-designer/data-links/get-by-module-port/get-data-links-by-module-port.handler.js';
import {GetDataLinksByModulePortQuery} from '../../../../../../src/application/usecase-designer/data-links/get-by-module-port/get-data-links-by-module-port.query.js';

describe('GetDataLinksByModulePortHandler', () => {
  it('maps module-port data links and hydrates their associated usecases', async () => {
    const filter = {
      moduleSystemId: 101,
      portSystemId: 202,
    };
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findByModulePort: jest.fn().mockResolvedValue(
          Result.ok([
            {
              link: {
                systemId: 303,
                sourceNodeSystemId: 101,
                destinationNodeSystemId: 102,
                sourcePortSystemId: 202,
                destinationPortSystemId: 204,
                linkType: 'NORMAL',
              },
              usecaseSystemIds: [404],
            },
          ]),
        ),
      },
      useCaseQueryService: {
        findUseCaseReadModels: jest.fn().mockResolvedValue({
          items: [
            {
              systemId: 404,
              gkv: [],
              alias: 'UC',
              aliasId: 405,
              categories: ['audio'],
              type: 'LINKED',
            },
          ],
          failed: [],
        }),
      },
    } as unknown as QueryServices;

    const result = await new GetDataLinksByModulePortHandler(services).handle(
      new GetDataLinksByModulePortQuery(7, 'client-1', filter),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(services.dataLinkQueryService.findByModulePort).toHaveBeenCalledWith(
      filter,
      55,
    );
    expect(result.data).toEqual([
      {
        link: {
          systemId: '303',
          sourceSystemId: '101',
          sourcePortSystemId: '202',
          destinationSystemId: '102',
          destinationPortSystemId: '204',
          linkType: 'NORMAL',
        },
        usecases: [
          {
            systemId: '404',
            usecaseType: 'LINKED',
            keyValuePairs: [],
            usecaseAliasId: 405,
            usecaseAliasName: 'UC',
            usecaseCategory: 'audio',
          },
        ],
      },
    ]);
  });

  it('reports an unresolved use case only when a returned link references it', async () => {
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findByModulePort: jest.fn().mockResolvedValue(
          Result.ok([
            {
              link: {
                systemId: 303,
                sourceNodeSystemId: 101,
                destinationNodeSystemId: 102,
                sourcePortSystemId: 202,
                destinationPortSystemId: 204,
                linkType: 'NORMAL',
              },
              usecaseSystemIds: [404],
            },
          ]),
        ),
      },
      useCaseQueryService: {
        findUseCaseReadModels: jest.fn().mockResolvedValue({
          items: [],
          failed: [
            {
              systemId: 404,
              reason: 'UNRESOLVED_REFERENCE',
              missingRef: {entityType: 'ValueDefinition' as const, systemId: 9},
            },
            {
              systemId: 500,
              reason: 'UNRESOLVED_REFERENCE',
              missingRef: {entityType: 'ValueDefinition' as const, systemId: 9},
            },
          ],
        }),
      },
    } as unknown as QueryServices;

    const result = await new GetDataLinksByModulePortHandler(services).handle(
      new GetDataLinksByModulePortQuery(7, 'client-1', {
        moduleSystemId: 101,
        portSystemId: 202,
      }),
    );

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data[0]?.usecases).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ENTITY_UNRESOLVED_REFERENCE',
        message:
          'UseCase with systemId: 0x00000194 was skipped: it references Value with systemId: 0x00000009, which was not found in this project.',
      }),
    ]);
  });

  it('returns an empty result without loading usecases when no links match', async () => {
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findByModulePort: jest.fn().mockResolvedValue(Result.ok([])),
      },
      useCaseQueryService: {
        findUseCaseReadModels: jest.fn(),
      },
    } as unknown as QueryServices;

    const result = await new GetDataLinksByModulePortHandler(services).handle(
      new GetDataLinksByModulePortQuery(7, 'client-1', {
        moduleSystemId: 101,
        portSystemId: 202,
      }),
    );

    expect(result).toEqual(Result.ok([]));
    expect(
      services.useCaseQueryService.findUseCaseReadModels,
    ).not.toHaveBeenCalled();
  });
});
