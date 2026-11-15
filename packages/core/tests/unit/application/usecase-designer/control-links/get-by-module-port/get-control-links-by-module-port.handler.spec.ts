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
import {GetControlLinksByModulePortHandler} from '../../../../../../src/application/usecase-designer/control-links/get-by-module-port/get-control-links-by-module-port.handler.js';
import {GetControlLinksByModulePortQuery} from '../../../../../../src/application/usecase-designer/control-links/get-by-module-port/get-control-links-by-module-port.query.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';

describe('GetControlLinksByModulePortHandler', () => {
  it('maps module-port control links and hydrates their associated usecases', async () => {
    const filter = {
      moduleSystemId: 101,
      portSystemId: 202,
    };
    const services = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(55),
      },
      controlLinkQueryService: {
        findSubgraphPeerLinks: jest.fn().mockResolvedValue([
          {
            link: {
              systemId: 303,
              peerNodeASystemId: 101,
              peerNodeBSystemId: 102,
              nodeAPortSystemId: 202,
              nodeBPortSystemId: 204,
              heapId: 0,
              linkType: 'INTER_USECASE',
            },
            usecaseSystemIds: [404],
          },
        ]),
      },
      useCaseQueryService: {
        findUseCaseReadModels: jest.fn().mockResolvedValue({
          entityType: ENTITY_TYPE.UseCase,
          items: [
            {
              systemId: 404,
              gkv: [],
              type: 'LINKED',
            },
          ],
          failed: [],
        }),
      },
    } as unknown as QueryServices;

    const result = await new GetControlLinksByModulePortHandler(
      services,
    ).handle(new GetControlLinksByModulePortQuery(7, 'client-1', filter));

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(
      services.controlLinkQueryService.findSubgraphPeerLinks,
    ).toHaveBeenCalledWith(55, filter);
    expect(result.data[0]).toEqual({
      link: {
        systemId: '303',
        sourceSystemId: '101',
        sourcePortSystemId: '202',
        destinationSystemId: '102',
        destinationPortSystemId: '204',
        linkType: 'INTER_USECASE',
      },
      usecases: [
        {
          systemId: '404',
          usecaseType: 'LINKED',
          keyValuePairs: [],
        },
      ],
    });
  });
});
