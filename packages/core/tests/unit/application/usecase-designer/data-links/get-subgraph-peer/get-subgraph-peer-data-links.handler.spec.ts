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
import {GetSubgraphPeerDataLinksHandler} from '../../../../../../src/application/usecase-designer/data-links/get-subgraph-peer/get-subgraph-peer-data-links.handler.js';
import {GetSubgraphPeerDataLinksQuery} from '../../../../../../src/application/usecase-designer/data-links/get-subgraph-peer/get-subgraph-peer-data-links.query.js';

describe('GetSubgraphPeerDataLinksHandler', () => {
  it('maps filtered data links and hydrates their associated usecases', async () => {
    const filter = {
      subgraphSystemId: 12,
      moduleSystemId: 101,
      portSystemId: 202,
    };
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findSubgraphPeerLinks: jest.fn().mockResolvedValue(
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
        getAllUseCases: jest.fn().mockResolvedValue(
          Result.ok([
            {
              systemId: 404,
              gkv: [],
              alias: 'UC',
              aliasId: 405,
              categories: ['audio'],
              type: 'LINKED',
            },
          ]),
        ),
      },
    } as unknown as QueryServices;

    const result = await new GetSubgraphPeerDataLinksHandler(services).handle(
      new GetSubgraphPeerDataLinksQuery(7, 'client-1', filter),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(
      services.dataLinkQueryService.findSubgraphPeerLinks,
    ).toHaveBeenCalledWith(filter, 55);
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

  it('returns an empty result without loading usecases when no links match', async () => {
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findSubgraphPeerLinks: jest.fn().mockResolvedValue(Result.ok([])),
      },
      useCaseQueryService: {
        getAllUseCases: jest.fn(),
      },
    } as unknown as QueryServices;

    const result = await new GetSubgraphPeerDataLinksHandler(services).handle(
      new GetSubgraphPeerDataLinksQuery(7, 'client-1', {
        subgraphSystemId: 12,
      }),
    );

    expect(result).toEqual(Result.ok([]));
    expect(services.useCaseQueryService.getAllUseCases).not.toHaveBeenCalled();
  });
});
