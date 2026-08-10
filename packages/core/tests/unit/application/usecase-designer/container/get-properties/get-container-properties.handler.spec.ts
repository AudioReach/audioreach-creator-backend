/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {GetContainerPropertiesHandler} from '../../../../../../src/application/usecase-designer/container/get-properties/get-container-properties.handler.js';
import {GetContainerPropertiesQuery} from '../../../../../../src/application/usecase-designer/container/get-properties/get-container-properties.query.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {PropertyPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/property-payload-read-model.js';
import type {ContainerPropertyDefinitionWithElementsReadModel} from '../../../../../../src/application/ports/persistence/query-services/container-property-definition/container-property-definition-with-elements-read-model.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';

const FILE_SYSTEM_ID = 5;
const CONTAINER_SYSTEM_ID = 10;
const PROJECT_ID = 1;

// A definition whose elementsStructure encodes a single UInt32
const ELEMENTS_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'volume',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);

const mockDef: ContainerPropertyDefinitionWithElementsReadModel = {
  systemId: 100,
  propertyId: 42,
  name: 'volume',
  description: 'Volume level',
  propertyType: 'SPF',
  maxSize: 4,
  elementsStructure: ELEMENTS_STRUCTURE,
};

const mockPayload: PropertyPayloadReadModel = {
  systemId: 200,
  propertySystemId: 100,
  payload: new Uint8Array([0x07, 0x00, 0x00, 0x00]),
};

function makeServices(
  overrides: {
    fileId?: number;
    payloadsResult?: Awaited<
      ReturnType<QueryServices['containerQueryService']['findPropertyPayloads']>
    >;
    definitionsResult?: Awaited<
      ReturnType<
        QueryServices['containerPropertyDefQueryService']['getAllDetailedContainerPropertyDefinitionsWithElements']
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
    containerQueryService: {
      findPropertyPayloads: jest.fn().mockResolvedValue(payloadsResult),
    },
    containerPropertyDefQueryService: {
      getAllDetailedContainerPropertyDefinitionsWithElements: jest
        .fn()
        .mockResolvedValue(definitionsResult),
    },
  } as unknown as QueryServices;
}

function makeQuery(): GetContainerPropertiesQuery {
  return new GetContainerPropertiesQuery(
    PROJECT_ID,
    CONTAINER_SYSTEM_ID,
    'client-id',
  );
}

describe('GetContainerPropertiesHandler', () => {
  it('happy path — returns ok Result with PropertyReadModel[] with joined definitions and parsed elements', async () => {
    const handler = new GetContainerPropertiesHandler(makeServices());
    const result = await handler.handle(makeQuery());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.properties).toHaveLength(1);
    expect(result.data!.properties[0].systemId).toBe('200');
    expect(result.data!.properties[0].propertyId).toBe(42);
    expect(result.data!.properties[0].propertyName).toBe('volume');
    expect(result.data!.properties[0].elements).not.toHaveLength(0);
  });

  it('container not found — throws ResourceNotFoundException when findPropertyPayloads returns ok(null)', async () => {
    const handler = new GetContainerPropertiesHandler(
      makeServices({payloadsResult: Result.ok(null)}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      `Container with systemId ${CONTAINER_SYSTEM_ID} not found`,
    );
  });

  it('payload null — elements array is empty []', async () => {
    const nullPayload: PropertyPayloadReadModel = {
      ...mockPayload,
      payload: null,
    };
    const handler = new GetContainerPropertiesHandler(
      makeServices({payloadsResult: Result.ok([nullPayload])}),
    );
    const result = await handler.handle(makeQuery());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.properties).toHaveLength(1);
    expect(result.data!.properties[0].elements).toEqual([]);
  });

  it('no payload for definition — returns partial result with PROPERTY_PAYLOAD_NOT_FOUND issue', async () => {
    const handler = new GetContainerPropertiesHandler(
      makeServices({
        payloadsResult: Result.ok([]),
        definitionsResult: Result.ok([mockDef]),
      }),
    );
    const result = await handler.handle(makeQuery());

    expect(result.kind).toBe(RESULT_KIND.Partial);
    expect(result.data!.properties).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe(ISSUE_CODE.PROPERTY_PAYLOAD_NOT_FOUND);
  });

  it('definitions fetch fails — throws Error', async () => {
    const failResult = Result.fail({
      code: 'INTERNAL_ERROR',
      message: 'DB error loading definitions',
      severity: 'Error' as any,
    });
    const handler = new GetContainerPropertiesHandler(
      makeServices({definitionsResult: failResult}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      'DB error loading definitions',
    );
  });
});
