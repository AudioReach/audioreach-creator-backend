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
const INSTANCE_ID = 5;
const CKV_ID = 10;
const PARAM_ID = 30;
const PAYLOAD_ID = 20;

const MOCK_INSTANCE = {systemId: INSTANCE_ID, subgraphSystemId: SUBGRAPH_ID};
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

function makeQuery(subgraphSystemId = SUBGRAPH_ID) {
  return new GetVcpmCkvQuery(1, subgraphSystemId, 'client-1');
}

function makeServices(
  overrides: {
    fileSystemId?: number;
    subgraphResult?: any;
    instance?: any;
    ckvs?: any[];
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
      getVcpmInstanceBySubgraph: jest
        .fn()
        .mockResolvedValue(
          overrides.instance !== undefined ? overrides.instance : MOCK_INSTANCE,
        ),
      getVcpmCkvsByInstance: jest
        .fn()
        .mockResolvedValue(overrides.ckvs ?? [MOCK_CKV]),
      getVcpmParameterPayloadsByInstance: jest
        .fn()
        .mockResolvedValue(overrides.payloads ?? [MOCK_PAYLOAD]),
      getVcpmParameterDefinitions: jest
        .fn()
        .mockResolvedValue(overrides.defs ?? [MOCK_DEF]),
    },
  } as unknown as QueryServices;
}

describe('GetVcpmCkvHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found (ok(null))', async () => {
    const handler = new GetVcpmCkvHandler(
      makeServices({subgraphResult: Result.ok(null)}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when findPropertyPayloads returns fail', async () => {
    const handler = new GetVcpmCkvHandler(
      makeServices({subgraphResult: Result.fail([{message: 'db error'}])}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('returns empty configuredParams when no VcpmInstance exists', async () => {
    const handler = new GetVcpmCkvHandler(makeServices({instance: null}));
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({configuredParams: []});
  });

  it('returns empty configuredParams when instance exists but no parameter payloads', async () => {
    const handler = new GetVcpmCkvHandler(makeServices({payloads: []}));
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({configuredParams: []});
  });

  it('throws when a parameter definition is missing for an active payload', async () => {
    const handler = new GetVcpmCkvHandler(makeServices({defs: []}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ParameterDefinitionMissingError,
    );
  });

  it('returns correct VcpmCkvDto with KeyValueInfoDto ckv entries', async () => {
    const handler = new GetVcpmCkvHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.configuredParams).toHaveLength(1);
    const param = result.data.configuredParams[0];
    expect(param.paramSystemId).toBe(String(PARAM_ID));
    expect(param.paramName).toBe('gain');
    expect(param.associatedCkvs).toHaveLength(1);
    expect(param.associatedCkvs[0].ckvSystemId).toBe(String(CKV_ID));
    expect(param.associatedCkvs[0].ckv).toEqual([MOCK_KV]);
  });

  it('associatedCkvs contains only CKVs that have a payload for the param', async () => {
    const ckv10 = {systemId: 10, values: [MOCK_KV]};
    const ckv11 = {systemId: 11, values: [MOCK_KV]};
    const payloads = [
      {
        systemId: 1,
        vcpmParameterSystemId: 30,
        vcpmCkvSystemId: 10,
        payload: new Uint8Array([0]),
      },
      {
        systemId: 2,
        vcpmParameterSystemId: 30,
        vcpmCkvSystemId: 11,
        payload: new Uint8Array([0]),
      },
      {
        systemId: 3,
        vcpmParameterSystemId: 31,
        vcpmCkvSystemId: 10,
        payload: new Uint8Array([0]),
      },
    ];
    const defs = [
      {
        systemId: 30,
        paramId: 1,
        name: 'gain',
        isReadOnly: false,
        elementsStructure: '[]',
      },
      {
        systemId: 31,
        paramId: 2,
        name: 'volume',
        isReadOnly: false,
        elementsStructure: '[]',
      },
    ];
    const handler = new GetVcpmCkvHandler(
      makeServices({ckvs: [ckv10, ckv11], payloads, defs}),
    );
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    const paramMap = new Map(
      result.data.configuredParams.map((p: any) => [p.paramSystemId, p]),
    );
    expect((paramMap.get('30') as any).associatedCkvs).toHaveLength(2);
    expect((paramMap.get('31') as any).associatedCkvs).toHaveLength(1);
    expect((paramMap.get('31') as any).associatedCkvs[0].ckvSystemId).toBe(
      '10',
    );
  });
});
