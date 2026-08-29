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
  key: {keyId: 1, name: 'mode', systemId: '100'},
  value: {valueId: 1, name: 'hifi', systemId: '200'},
};
const MOCK_CKV = {systemId: CKV_ID, values: [MOCK_KV]};
const MOCK_PAYLOAD = {
  systemId: PAYLOAD_ID,
  vcpmParameterSystemId: PARAM_ID,
  vcpmCkvSystemId: CKV_ID,
  payload: new Uint8Array([0, 0, 0, 0]),
};
const MOCK_DEF = {
  systemId: PARAM_ID,
  paramId: 1,
  name: 'gain',
  isReadOnly: false,
  elementsStructure: '[]',
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
  overrides: {
    fileSystemId?: number;
    subgraphResult?: any;
    ckv?: any;
    payloads?: any[];
    defs?: any[];
  } = {},
): QueryServices {
  return {
    projectQueryService: {
      getFileIdByProjectId: jest
        .fn()
        .mockResolvedValue(overrides.fileSystemId ?? FILE_ID),
    },
    subgraphQueryService: {
      findPropertyPayloads: jest
        .fn()
        .mockResolvedValue(
          overrides.subgraphResult ?? Result.ok({systemId: SUBGRAPH_ID}),
        ),
    },
    vcpmQueryService: {
      getVcpmCkv: jest
        .fn()
        .mockResolvedValue(
          overrides.ckv !== undefined ? overrides.ckv : MOCK_CKV,
        ),
      getVcpmParameterPayloads: jest
        .fn()
        .mockResolvedValue(overrides.payloads ?? [MOCK_PAYLOAD]),
      getVcpmParameterDefinitions: jest
        .fn()
        .mockResolvedValue(overrides.defs ?? [MOCK_DEF]),
    },
  } as unknown as QueryServices;
}

describe('GetVcpmCalDataHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices({subgraphResult: Result.ok(null)}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when CKV not found', async () => {
    const handler = new GetVcpmCalDataHandler(makeServices({ckv: null}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('returns CkvCalDataDto with correct shape', async () => {
    const handler = new GetVcpmCalDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.systemId).toBe(String(CKV_ID));
    expect(result.data.Ckv).toEqual([MOCK_KV]);
    expect(result.data.parameters).toHaveLength(1);
    const p = result.data.parameters[0];
    expect(p.systemId).toBe(String(PAYLOAD_ID));
    expect(p.parameterId).toBe('1');
    expect(p.name).toBe('gain');
    expect(p.isReadOnly).toBe(false);
    expect(p.elements).toEqual([]);
  });

  it('passes paramSystemIds filter to getVcpmParameterPayloads when provided', async () => {
    const svc = makeServices();
    const handler = new GetVcpmCalDataHandler(svc);
    await handler.handle(makeQuery([PARAM_ID]));
    expect(
      (svc.vcpmQueryService.getVcpmParameterPayloads as jest.Mock).mock
        .calls[0][3],
    ).toEqual([PARAM_ID]);
  });

  it('passes undefined to getVcpmParameterPayloads when no filter', async () => {
    const svc = makeServices();
    const handler = new GetVcpmCalDataHandler(svc);
    await handler.handle(makeQuery([]));
    expect(
      (svc.vcpmQueryService.getVcpmParameterPayloads as jest.Mock).mock
        .calls[0][3],
    ).toBeUndefined();
  });

  it('returns elements as [] when payload is null', async () => {
    const handler = new GetVcpmCalDataHandler(
      makeServices({payloads: [{...MOCK_PAYLOAD, payload: null}]}),
    );
    const result = await handler.handle(makeQuery());
    expect(result.data.parameters[0].elements).toEqual([]);
  });

  it('throws when a parameter definition is missing', async () => {
    const handler = new GetVcpmCalDataHandler(makeServices({defs: []}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ParameterDefinitionMissingError,
    );
  });
});
