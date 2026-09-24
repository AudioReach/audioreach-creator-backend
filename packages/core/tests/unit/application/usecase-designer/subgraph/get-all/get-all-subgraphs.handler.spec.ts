/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {GetAllSubgraphsHandler} from '../../../../../../src/application/usecase-designer/subgraph/get-all/get-all-subgraphs.handler.js';
import {GetAllSubgraphsQuery} from '../../../../../../src/application/usecase-designer/subgraph/get-all/get-all-subgraphs.query.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SubgraphReadModel} from '../../../../../../src/application/ports/persistence/query-services/subgraph/subgraph-read-model.js';
import {CONFIGURATION_INCLUDES} from '../../../../../../src/application/ports/persistence/query-services/configuration-includes.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';

const FILE_SYSTEM_ID = 42;

const readModels: SubgraphReadModel[] = [
  {
    systemId: 10,
    naturalId: 100,
    name: 'SG_100',
    isImported: false,
    sgkvs: null,
  },
  {
    systemId: 20,
    naturalId: 200,
    name: 'SG_200',
    isImported: true,
    sgkvs: [
      {
        systemId: 30,
        keyValuePairs: [
          {
            key: {systemId: 40, naturalId: 400, name: 'Stream'},
            value: {systemId: 50, naturalId: 500, name: 'Playback'},
          },
        ],
      },
    ],
  },
];

function makeServices(
  result: Awaited<
    ReturnType<QueryServices['subgraphQueryService']['getAllSubgraphs']>
  > = Result.ok(readModels),
): QueryServices {
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(FILE_SYSTEM_ID),
    },
    subgraphQueryService: {
      getAllSubgraphs: jest.fn().mockResolvedValue(result),
    },
  } as unknown as QueryServices;
}

describe('GetAllSubgraphsHandler', () => {
  it('loads full-detail subgraphs for the project file and maps API DTO fields', async () => {
    const services = makeServices();
    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;

    expect(
      services.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(services.subgraphQueryService.getAllSubgraphs).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      CONFIGURATION_INCLUDES.FullDetails,
      undefined,
    );
    expect(result.data).toEqual([
      {
        systemId: '10',
        naturalId: 100,
        name: 'SG_100',
        subGraphSharedType: 'None',
        SGKV: [],
      },
      {
        systemId: '20',
        naturalId: 200,
        name: 'SG_200',
        subGraphSharedType: 'Imported',
        SGKV: [
          {
            systemId: '30',
            keyValuePairs: [
              {
                key: {naturalId: 400, name: 'Stream', systemId: '40'},
                value: {naturalId: 500, name: 'Playback', systemId: '50'},
              },
            ],
          },
        ],
      },
    ]);
  });

  it('forwards requested subgraph system IDs to the persistence service', async () => {
    const services = makeServices(Result.ok([readModels[1]]));
    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1', [20, 999]),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].systemId).toBe('20');
    expect(services.subgraphQueryService.getAllSubgraphs).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      CONFIGURATION_INCLUDES.FullDetails,
      [20, 999],
    );
  });

  it('propagates failure results from the subgraph query service', async () => {
    const services = makeServices(
      Result.fail({
        code: 'DB_QUERY_FAILED',
        message: 'failed',
        severity: 'Error' as any,
      }),
    );

    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1'),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});
