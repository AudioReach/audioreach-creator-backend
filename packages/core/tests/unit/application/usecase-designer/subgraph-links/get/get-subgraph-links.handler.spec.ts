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
import {GetSubgraphLinksHandler} from '../../../../../../src/application/usecase-designer/subgraph-links/get/get-subgraph-links.handler.js';
import {GetSubgraphLinksQuery} from '../../../../../../src/application/usecase-designer/subgraph-links/get/get-subgraph-links.query.js';

describe('GetSubgraphLinksHandler', () => {
  it('returns data and control links with associated usecases', async () => {
    const filter = {
      subgraphSystemId: 501,
      subgraphPeerSystemId: 502,
    };
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findBySubgraph: jest.fn().mockResolvedValue(
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
      controlLinkQueryService: {
        findBySubgraph: jest.fn().mockResolvedValue(
          Result.ok([
            {
              link: {
                systemId: 305,
                peerNodeASystemId: 103,
                peerNodeBSystemId: 104,
                nodeAPortSystemId: 206,
                nodeBPortSystemId: 208,
                heapId: 0,
                linkType: 'INTER_USECASE',
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

    const result = await new GetSubgraphLinksHandler(services).handle(
      new GetSubgraphLinksQuery(7, 'client-1', filter),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(services.dataLinkQueryService.findBySubgraph).toHaveBeenCalledWith(
      filter,
      55,
    );
    expect(
      services.controlLinkQueryService.findBySubgraph,
    ).toHaveBeenCalledWith(filter, 55);
    expect(result.data).toEqual({
      dataLinks: [
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
      ],
      controlLinks: [
        {
          link: {
            systemId: '305',
            sourceSystemId: '103',
            sourcePortSystemId: '206',
            destinationSystemId: '104',
            destinationPortSystemId: '208',
            linkType: 'INTER_USECASE',
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
      ],
    });
  });

  it('does not load usecases when neither link type matches', async () => {
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      dataLinkQueryService: {
        findBySubgraph: jest.fn().mockResolvedValue(Result.ok([])),
      },
      controlLinkQueryService: {
        findBySubgraph: jest.fn().mockResolvedValue(Result.ok([])),
      },
      useCaseQueryService: {
        getAllUseCases: jest.fn(),
      },
    } as unknown as QueryServices;

    const result = await new GetSubgraphLinksHandler(services).handle(
      new GetSubgraphLinksQuery(7, 'client-1', {subgraphSystemId: 501}),
    );

    expect(result).toEqual(Result.ok({dataLinks: [], controlLinks: []}));
    expect(services.useCaseQueryService.getAllUseCases).not.toHaveBeenCalled();
  });
});
