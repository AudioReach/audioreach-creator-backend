/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {GetVcpmCkvHandler} from '../../../../src/application/usecase-designer/subgraph/get-vcpm-ckv/get-vcpm-ckv.handler.js';
import {GetVcpmCkvQuery} from '../../../../src/application/usecase-designer/subgraph/get-vcpm-ckv/get-vcpm-ckv.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../src/application/shared/result/result.js';
import {ResourceNotFoundException} from '../../../../src/shared/exceptions/resource-not-found.exception.js';
import {ParameterDefinitionMissingError} from '../../../../src/shared/errors/parameter.errors.js';
import type {QueryServices} from '../../../../src/application/ports/persistence/query-services/query-services.js';
import {describe, it, expect, jest} from '@jest/globals';

const FILE_ID = 10;
const SUBGRAPH_ID = 1;
const CKV_ID = 10;
const PARAM_ID = 30;

const MOCK_KV = {
  key: {naturalId: 1, name: 'mode', systemId: '100'},
  value: {naturalId: 1, name: 'hifi', systemId: '200'},
};

const MOCK_AGGREGATE = {
  ckvs: [{systemId: CKV_ID, values: [MOCK_KV]}],
  parameterCkvLinks: [{parameterSystemId: PARAM_ID, ckvSystemIds: [CKV_ID]}],
  payloads: [],
  parameterDefinitions: [
    {
      systemId: PARAM_ID,
      paramId: 1,
      name: 'gain',
      isReadOnly: false,
      elementsStructure: '[]',
    },
  ],
};

function makeQuery() {
  return new GetVcpmCkvQuery(1, SUBGRAPH_ID, 'client-1');
}

function makeServices(
  aggregate = MOCK_AGGREGATE,
  subgraphResult = Result.ok({systemId: SUBGRAPH_ID}),
): QueryServices {
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(FILE_ID),
    },
    subgraphQueryService: {
      findPropertyPayloads: jest.fn().mockResolvedValue(subgraphResult),
      getVcpmAggregateBySubgraph: jest
        .fn()
        .mockResolvedValue(Result.ok(aggregate)),
    },
  } as unknown as QueryServices;
}

describe('GetVcpmCkvHandler', () => {
  it('throws when the subgraph does not exist', async () => {
    const handler = new GetVcpmCkvHandler(
      makeServices(MOCK_AGGREGATE, Result.ok(null)),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('returns no configured parameters for an empty aggregate', async () => {
    const handler = new GetVcpmCkvHandler(
      makeServices({...MOCK_AGGREGATE, parameterCkvLinks: []}),
    );
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({configuredParams: []});
  });

  it('composes configured parameters from aggregate links and definitions', async () => {
    const handler = new GetVcpmCkvHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.configuredParams).toEqual([
      {
        paramSystemId: String(PARAM_ID),
        paramName: 'gain',
        associatedCkvs: [{ckvSystemId: String(CKV_ID), ckv: [MOCK_KV]}],
      },
    ]);
  });

  it('throws when an aggregate link has no parameter definition', async () => {
    const handler = new GetVcpmCkvHandler(
      makeServices({...MOCK_AGGREGATE, parameterDefinitions: []}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ParameterDefinitionMissingError,
    );
  });
});
