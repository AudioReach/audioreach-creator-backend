/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {GetVcpmCalDataHandler} from '../../../../src/application/usecase-designer/subgraph/get-vcpm-cal-data/get-vcpm-cal-data.handler.js';
import type {GetVcpmCalDataQuery} from '../../../../src/application/usecase-designer/subgraph/get-vcpm-cal-data/get-vcpm-cal-data.query.js';
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
const PAYLOAD_ID = 20;

const MOCK_KV = {
  key: {naturalId: 1, name: 'mode', systemId: '100'},
  value: {naturalId: 1, name: 'hifi', systemId: '200'},
};
const MOCK_AGGREGATE = {
  ckvs: [{systemId: CKV_ID, values: [MOCK_KV]}],
  parameterCkvLinks: [{parameterSystemId: PARAM_ID, ckvSystemIds: [CKV_ID]}],
  payloads: [
    {
      systemId: PAYLOAD_ID,
      vcpmParameterSystemId: PARAM_ID,
      vcpmCkvSystemId: CKV_ID,
      payload: new Uint8Array([0, 0, 0, 0]),
    },
  ],
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

function makeQuery(paramSystemIds: number[] = []): GetVcpmCalDataQuery {
  return {
    projectId: 1,
    subgraphSystemId: SUBGRAPH_ID,
    ckvSystemId: CKV_ID,
    paramSystemIds,
  } as unknown as GetVcpmCalDataQuery;
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

describe('GetVcpmCalDataHandler', () => {
  it('throws when the subgraph does not exist', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices(MOCK_AGGREGATE, Result.ok(null)),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('does not map a subgraph query failure to ResourceNotFoundException', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices(
        MOCK_AGGREGATE,
        Result.fail({
          code: 'INTERNAL_ERROR',
          message: 'Database unavailable',
          severity: 'ERROR',
        }),
      ),
    );

    const error = await handler.handle(makeQuery()).catch(error => error);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ResourceNotFoundException);
    expect(error.message).toBe('Database unavailable');
  });

  it('throws when the selected CKV is absent from the aggregate', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices({...MOCK_AGGREGATE, ckvs: []}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('passes the selected CKV and parameter filter to the aggregate query', async () => {
    const services = makeServices();
    const handler = new GetVcpmCalDataHandler(services);
    await handler.handle(makeQuery([PARAM_ID]));
    expect(
      (services.subgraphQueryService.getVcpmAggregateBySubgraph as jest.Mock)
        .mock.calls[0],
    ).toEqual([
      SUBGRAPH_ID,
      FILE_ID,
      {ckvSystemId: CKV_ID, paramSystemIds: [PARAM_ID]},
    ]);
  });

  it('composes parsed elements and empty elements for null payloads', async () => {
    const handler = new GetVcpmCalDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.systemId).toBe(String(CKV_ID));
    expect(result.data.Ckv).toEqual([MOCK_KV]);
    expect(result.data.parameters[0].systemId).toBe(String(PAYLOAD_ID));
    expect(result.data.parameters[0].naturalId).toBe('1');
    expect(result.data.parameters[0].elements).toEqual([]);

    const nullPayloadHandler = new GetVcpmCalDataHandler(
      makeServices({
        ...MOCK_AGGREGATE,
        payloads: [{...MOCK_AGGREGATE.payloads[0], payload: null}],
      }),
    );
    const nullResult = await nullPayloadHandler.handle(makeQuery());
    expect(nullResult.data.parameters[0].elements).toEqual([]);
  });

  it('throws when a payload has no parameter definition', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices({...MOCK_AGGREGATE, parameterDefinitions: []}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ParameterDefinitionMissingError,
    );
  });
});
