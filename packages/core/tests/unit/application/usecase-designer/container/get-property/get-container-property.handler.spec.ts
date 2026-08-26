/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {GetContainerPropertyHandler} from '../../../../../../src/application/usecase-designer/container/get-property/get-container-property.handler.js';
import {GetContainerPropertyQuery} from '../../../../../../src/application/usecase-designer/container/get-property/get-container-property.query.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {PropertyPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/property-payload-read-model.js';
import type {ContainerPropertyDefinitionWithElementsReadModel} from '../../../../../../src/application/ports/persistence/query-services/container-property-definition/container-property-definition-with-elements-read-model.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';

const FILE_SYSTEM_ID = 5;
const CONTAINER_SYSTEM_ID = 10;
const PROPERTY_SYSTEM_ID = 100;
const PROJECT_ID = 1;

const ELEMENTS_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'volume',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);

const mockDef: ContainerPropertyDefinitionWithElementsReadModel = {
  systemId: PROPERTY_SYSTEM_ID,
  propertyId: 42,
  name: 'volume',
  description: 'Volume level',
  propertyType: 'SPF',
  maxSize: 4,
  elementsStructure: ELEMENTS_STRUCTURE,
};

const mockPayload: PropertyPayloadReadModel = {
  systemId: 200,
  propertySystemId: PROPERTY_SYSTEM_ID,
  payload: new Uint8Array([0x07, 0x00, 0x00, 0x00]),
};

function makeServices(
  overrides: {
    fileId?: number;
    payloadsResult?: Awaited<
      ReturnType<QueryServices['containerQueryService']['findPropertyPayloads']>
    >;
    defResult?: Awaited<
      ReturnType<
        QueryServices['containerPropertyDefQueryService']['getContainerPropertyDefinitionWithElements']
      >
    >;
  } = {},
): QueryServices {
  const {
    fileId = FILE_SYSTEM_ID,
    payloadsResult = Result.ok([mockPayload]),
    defResult = Result.ok(mockDef),
  } = overrides;

  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    containerQueryService: {
      findPropertyPayloads: jest.fn().mockResolvedValue(payloadsResult),
    },
    containerPropertyDefQueryService: {
      getContainerPropertyDefinitionWithElements: jest
        .fn()
        .mockResolvedValue(defResult),
    },
  } as unknown as QueryServices;
}

function makeQuery(): GetContainerPropertyQuery {
  return new GetContainerPropertyQuery(
    PROJECT_ID,
    CONTAINER_SYSTEM_ID,
    PROPERTY_SYSTEM_ID,
    'client-id',
  );
}

describe('GetContainerPropertyHandler', () => {
  it('container not found — throws ResourceNotFoundException when findPropertyPayloads returns ok(null)', async () => {
    const handler = new GetContainerPropertyHandler(
      makeServices({payloadsResult: Result.ok(null)}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      `Container with systemId ${CONTAINER_SYSTEM_ID} not found`,
    );
  });

  it('property payload not on container — throws ResourceNotFoundException when payload is not in the list', async () => {
    const otherPayload: PropertyPayloadReadModel = {
      ...mockPayload,
      propertySystemId: 999,
    };
    const handler = new GetContainerPropertyHandler(
      makeServices({payloadsResult: Result.ok([otherPayload])}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      `Property ${PROPERTY_SYSTEM_ID} not found on container ${CONTAINER_SYSTEM_ID}`,
    );
  });

  it('property definition not found — throws ResourceNotFoundException when getContainerPropertyDefinitionWithElements returns fail', async () => {
    const failResult = Result.fail({
      code: 'NOT_FOUND',
      message: `Property definition ${PROPERTY_SYSTEM_ID} not found`,
      severity: 'Error' as any,
    });
    const handler = new GetContainerPropertyHandler(
      makeServices({defResult: failResult}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      `Property definition ${PROPERTY_SYSTEM_ID} not found`,
    );
  });

  it('success with payload present — returns Result.ok with parsed elements', async () => {
    const handler = new GetContainerPropertyHandler(makeServices());
    const result = await handler.handle(makeQuery());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.systemId).toBe(200);
    expect(result.data!.propertyId).toBe(42);
    expect(result.data!.propertyName).toBe('volume');
    expect(result.data!.elements).not.toHaveLength(0);
  });

  it('success with null payload — returns Result.ok with elements: []', async () => {
    const nullPayload: PropertyPayloadReadModel = {
      ...mockPayload,
      payload: null,
    };
    const handler = new GetContainerPropertyHandler(
      makeServices({payloadsResult: Result.ok([nullPayload])}),
    );
    const result = await handler.handle(makeQuery());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.elements).toEqual([]);
  });
});
