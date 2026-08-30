/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {GetSubgraphPropertyHandler} from '../../../../../../src/application/usecase-designer/subgraph/get-property/get-subgraph-property.handler.js';
import {GetSubgraphPropertyQuery} from '../../../../../../src/application/usecase-designer/subgraph/get-property/get-subgraph-property.query.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';

const FILE_ID = 7;
const SG_ID = 20;
const PROP_DEF_ID = 101;
const PROJECT_ID = 2;

const ELEMENTS_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'gain',
    dataType: 'UInt32',
    isReadOnly: false,
  },
]);

const mockDef = {
  systemId: PROP_DEF_ID,
  propertyId: 55,
  name: 'gain',
  description: '',
  propertyType: 'SPF',
  maxSize: 4,
  isVoice: false,
  elementsStructure: ELEMENTS_STRUCTURE,
};

const mockPayload = {
  systemId: 201,
  propertySystemId: PROP_DEF_ID,
  payload: new Uint8Array([0x03, 0x00, 0x00, 0x00]),
};

function makeServices(
  overrides: {
    fileId?: number;
    payloadsResult?: any;
    defResult?: any;
  } = {},
): QueryServices {
  const {
    fileId = FILE_ID,
    payloadsResult = Result.ok([mockPayload]),
    defResult = Result.ok(mockDef),
  } = overrides;

  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    subgraphQueryService: {
      findPropertyPayloads: jest.fn().mockResolvedValue(payloadsResult),
    },
    subgraphPropertyDefQueryService: {
      getSubgraphPropertyDefinitionWithElements: jest
        .fn()
        .mockResolvedValue(defResult),
    },
  } as unknown as QueryServices;
}

describe('GetSubgraphPropertyHandler', () => {
  const query = new GetSubgraphPropertyQuery(
    PROJECT_ID,
    SG_ID,
    PROP_DEF_ID,
    'c',
  );

  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const svc = makeServices({payloadsResult: Result.ok(null)});
    const handler = new GetSubgraphPropertyHandler(svc);
    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when property not on subgraph', async () => {
    const svc = makeServices({payloadsResult: Result.ok([])});
    const handler = new GetSubgraphPropertyHandler(svc);
    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when property definition not found', async () => {
    const svc = makeServices({
      defResult: Result.fail({
        code: 'ENTITY_NOT_FOUND',
        message: 'not found',
        severity: 'Error',
      }),
    });
    const handler = new GetSubgraphPropertyHandler(svc);
    await expect(handler.handle(query)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('returns PropertyDataDto with parsed elements on success', async () => {
    const handler = new GetSubgraphPropertyHandler(makeServices());
    const result = await handler.handle(query);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.propertyId).toBe(55);
    expect(result.data.elements).toHaveLength(1);
  });
});
