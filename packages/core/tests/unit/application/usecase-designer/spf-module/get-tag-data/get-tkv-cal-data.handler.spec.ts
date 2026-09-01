/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {describe, it, expect} from '@jest/globals';
import {GetTkvCalibrationDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.js';
import {GetTkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.js';
import {TkvCalDataDtoSchema} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {ParameterPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {TkvReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../../../../src/shared/errors/parameter.errors.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';

const mockTkv: TkvReadModel = {
  systemId: 10,
  moduleTagIdMapSystemId: 3,
  keyValuePairs: [],
};

const mockPayload: ParameterPayloadReadModel = {
  systemId: 20,
  parameterSystemId: 100,
  payload: new Uint8Array([0x05, 0x00, 0x00, 0x00]),
};

const mockDef: ParameterDefinitionReadModel = {
  systemId: 100,
  paramId: 42,
  name: 'gain',
  elementsStructure: JSON.stringify([
    {
      elementType: 'ConfigElement',
      name: 'gain',
      dataType: 'UInt32',
      isReadOnly: false,
    },
  ]),
  isReadOnly: false,
  pidType: 'PARAM_ID_GAIN',
};

function makeServices(
  overrides: {
    fileId?: number;
    moduleDefId?: number;
    tkv?: TkvReadModel | null;
    payloads?: ParameterPayloadReadModel[];
    defs?: ParameterDefinitionReadModel[];
  } = {},
): QueryServices {
  const {
    fileId = 5,
    moduleDefId = 50,
    tkv = mockTkv,
    payloads = [mockPayload],
    defs = [mockDef],
  } = overrides;
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    spfModuleQueryService: {
      getSpfModule: jest
        .fn()
        .mockResolvedValue(Result.ok({definitionSystemId: moduleDefId})),
      tkvQueryService: {
        getTkv: jest.fn().mockResolvedValue(tkv),
        getTkvPayloads: jest.fn().mockResolvedValue(payloads),
      },
    },
    spfModuleDefinitionQueryService: {
      queryParameterDefinitions: jest.fn().mockResolvedValue(defs),
    },
    modulesQueryService: {} as any,
    useCaseQueryService: {} as any,
    validationQueryService: {} as any,
  } as unknown as QueryServices;
}

function makeQuery(
  overrides: {paramSystemIds?: string} = {},
): GetTkvCalibrationDataQuery {
  return new GetTkvCalibrationDataQuery(
    '1',
    '2',
    '3',
    '10',
    'client-id',
    overrides.paramSystemIds,
  );
}

describe('GetTkvCalibrationDataHandler', () => {
  it('returns Result<TkvCalDataDto> with parsed parameters', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.systemId).toBe('10');
    expect(result.data.parameters).toHaveLength(1);
    expect(result.data.parameters[0].name).toBe('gain');
    expect(result.data.parameters[0].elements[0]).toMatchObject({
      type: 'ConfigElement',
      name: 'gain',
      value: '5',
    });
    expect(TkvCalDataDtoSchema.safeParse(result.data).success).toBe(true);
  });

  it('passes tagSystemId to getTkv', async () => {
    const services = makeServices();
    const handler = new GetTkvCalibrationDataHandler(services);
    await handler.handle(makeQuery());
    const getTkv = (services.spfModuleQueryService as any).tkvQueryService
      .getTkv as jest.Mock;
    expect(getTkv).toHaveBeenCalledWith(
      expect.any(Number), // fileSystemId
      expect.any(Number), // moduleSystemId
      3, // tagSystemId (from query)
      10, // tkvSystemId
    );
  });

  it('throws ResourceNotFoundException when TKV not found', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices({tkv: null}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws NullPayloadError when payload is null', async () => {
    const handler = new GetTkvCalibrationDataHandler(
      makeServices({payloads: [{...mockPayload, payload: null}]}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(NullPayloadError);
  });

  it('throws ParameterDefinitionMissingError when definition is absent', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices({defs: []}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ParameterDefinitionMissingError,
    );
  });

  it('joins payloads to definitions by parameterSystemId → systemId', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.parameters[0].parameterId).toBe('42');
  });

  it('returns Result.partial when requested paramSystemIds are missing from payloads', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    // paramSystemId 999 doesn't exist in mockPayload (systemId=20)
    const result = await handler.handle(makeQuery({paramSystemIds: '20,999'}));
    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.issues.some(i => i.message.includes('999'))).toBe(true);
  });

  it('throws ResourceNotFoundException when getSpfModule returns Result.fail', async () => {
    const services = makeServices();
    (
      services.spfModuleQueryService.getSpfModule as jest.Mock
    ).mockResolvedValue(
      Result.fail({code: 'ERR_4004', message: 'not found', severity: 'ERROR'}),
    );
    const handler = new GetTkvCalibrationDataHandler(services);
    await expect(handler.handle(makeQuery())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
});
