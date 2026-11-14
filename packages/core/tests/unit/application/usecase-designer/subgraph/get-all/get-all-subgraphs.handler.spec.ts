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
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {FAILED_ENTITY_REASON} from '../../../../../../src/application/ports/persistence/batch-read.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {batchOf} from '../../../../../helpers/index.js';

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

type SubgraphBatch = Awaited<
  ReturnType<QueryServices['subgraphQueryService']['findSubgraphs']>
>;

function makeServices(
  batch: SubgraphBatch = batchOf(ENTITY_TYPE.Subgraph, readModels),
): QueryServices {
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(FILE_SYSTEM_ID),
    },
    subgraphQueryService: {
      findAllSubgraphs: jest.fn().mockResolvedValue(batch),
      findSubgraphs: jest.fn().mockResolvedValue(batch),
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
    expect(services.subgraphQueryService.findAllSubgraphs).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      CONFIGURATION_INCLUDES.FullDetails,
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

  it('loads only the requested subgraphs', async () => {
    const services = makeServices(
      batchOf(ENTITY_TYPE.Subgraph, [readModels[1]]),
    );
    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1', [20]),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.map(dto => dto.systemId)).toEqual(['20']);
    expect(services.subgraphQueryService.findSubgraphs).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      [20],
      CONFIGURATION_INCLUDES.FullDetails,
    );
  });

  it('returns the loaded subgraphs with an issue for each missing one', async () => {
    const services = makeServices(
      batchOf(
        ENTITY_TYPE.Subgraph,
        [readModels[1]],
        [{systemId: 999, reason: FAILED_ENTITY_REASON.NotFound}],
      ),
    );
    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1', [20, 999]),
    );

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data.map(dto => dto.systemId)).toEqual(['20']);
    expect(result.issues.map(issue => issue.code)).toEqual([
      ISSUE_CODE.ENTITY_NOT_FOUND,
    ]);
  });

  it('names a subgraph skipped for an unresolved key value', async () => {
    const services = makeServices(
      batchOf(
        ENTITY_TYPE.Subgraph,
        [readModels[0]],
        [
          {
            systemId: 20,
            reason: FAILED_ENTITY_REASON.UnresolvedReference,
            identity: {name: 'SG A', naturalId: 200},
            missingRef: {entityType: ENTITY_TYPE.ValueDefinition, systemId: 50},
          },
        ],
      ),
    );
    const result = await new GetAllSubgraphsHandler(services).handle(
      new GetAllSubgraphsQuery(7, 'client-1'),
    );

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data.map(dto => dto.systemId)).toEqual(['10']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe(ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE);
    expect(result.issues[0].message).toContain("Subgraph 'SG A'");
  });

  it('propagates infrastructure errors from the subgraph query service', async () => {
    const services = makeServices();
    jest
      .mocked(services.subgraphQueryService.findAllSubgraphs)
      .mockRejectedValue(new Error('db down'));

    await expect(
      new GetAllSubgraphsHandler(services).handle(
        new GetAllSubgraphsQuery(7, 'client-1'),
      ),
    ).rejects.toThrow('db down');
  });
});
