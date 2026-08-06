/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {GetSubgraphPropertiesHandler} from '../../../../../../src/application/usecase-designer/subgraph/get-properties/get-subgraph-properties.handler.js';
import {GetSubgraphPropertiesQuery} from '../../../../../../src/application/usecase-designer/subgraph/get-properties/get-subgraph-properties.query.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {PropertyPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/property-payload-read-model.js';
import type {SubgraphPropertyDefinitionWithElementsReadModel} from '../../../../../../src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result} from '../../../../../../src/application/shared/result/result.js';

const FILE_SYSTEM_ID = 7;
const SUBGRAPH_SYSTEM_ID = 20;
const PROJECT_ID = 2;

const ELEMENTS_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'gain',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);

const mockDef: SubgraphPropertyDefinitionWithElementsReadModel = {
  systemId: 101,
  propertyId: 55,
  name: 'gain',
  description: 'Gain level',
  propertyType: 'SPF',
  maxSize: 4,
  isVoice: false,
  elementsStructure: ELEMENTS_STRUCTURE,
};

const mockPayload: PropertyPayloadReadModel = {
  systemId: 201,
  propertySystemId: 101,
  payload: new Uint8Array([0x03, 0x00, 0x00, 0x00]),
};

function makeServices(
  overrides: {
    fileId?: number;
    payloadsResult?: Awaited<
      ReturnType<QueryServices['subgraphQueryService']['findPropertyPayloads']>
    >;
    definitionsResult?: Awaited<
      ReturnType<
        QueryServices['subgraphPropertyDefQueryService']['getAllDetailedSubgraphPropertyDefinitionsWithElements']
      >
    >;
  } = {},
): QueryServices {
  const {
    fileId = FILE_SYSTEM_ID,
    payloadsResult = Result.ok([mockPayload]),
    definitionsResult = Result.ok([mockDef]),
  } = overrides;

  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    subgraphQueryService: {
      findPropertyPayloads: jest.fn().mockResolvedValue(payloadsResult),
    },
    subgraphPropertyDefQueryService: {
      getAllDetailedSubgraphPropertyDefinitionsWithElements: jest
        .fn()
        .mockResolvedValue(definitionsResult),
    },
  } as unknown as QueryServices;
}

function makeQuery(): GetSubgraphPropertiesQuery {
  return new GetSubgraphPropertiesQuery(
    PROJECT_ID,
    SUBGRAPH_SYSTEM_ID,
    'client-id',
  );
}

describe('GetSubgraphPropertiesHandler', () => {
  it('happy path — returns PropertyReadModel[] with joined definitions and parsed elements', async () => {
    const handler = new GetSubgraphPropertiesHandler(makeServices());
    const result = await handler.handle(makeQuery());

    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(201);
    expect(result[0].propertyId).toBe(55);
    expect(result[0].propertyName).toBe('gain');
    expect(result[0].elements).not.toHaveLength(0);
  });

  it('subgraph not found — throws ResourceNotFoundException when findPropertyPayloads returns ok(null)', async () => {
    const handler = new GetSubgraphPropertiesHandler(
      makeServices({payloadsResult: Result.ok(null)}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      `Subgraph with systemId ${SUBGRAPH_SYSTEM_ID} not found`,
    );
  });

  it('payload null — elements array is empty []', async () => {
    const nullPayload: PropertyPayloadReadModel = {
      ...mockPayload,
      payload: null,
    };
    const handler = new GetSubgraphPropertiesHandler(
      makeServices({payloadsResult: Result.ok([nullPayload])}),
    );
    const result = await handler.handle(makeQuery());

    expect(result).toHaveLength(1);
    expect(result[0].elements).toEqual([]);
  });

  it('no payload for definition — throws ResourceNotFoundException', async () => {
    const handler = new GetSubgraphPropertiesHandler(
      makeServices({
        payloadsResult: Result.ok([]),
        definitionsResult: Result.ok([mockDef]),
      }),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('definitions fetch fails — throws Error', async () => {
    const failResult = Result.fail({
      code: 'INTERNAL_ERROR',
      message: 'DB error loading subgraph definitions',
      severity: 'Error' as any,
    });
    const handler = new GetSubgraphPropertiesHandler(
      makeServices({definitionsResult: failResult}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      'DB error loading subgraph definitions',
    );
  });
});
