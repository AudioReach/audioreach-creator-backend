/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {GetCkvCalibrationDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.handler.js';
import {GetCkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.query.js';
import {CkvCalDataDtoSchema} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {ParameterPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {CkvReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/shared/element-definition.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../../../../src/shared/errors/parameter.errors.js';

const mockCkv: CkvReadModel = {
  systemId: 10,
  uiPersistence: null,
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
    ckv?: CkvReadModel | null;
    payloads?: ParameterPayloadReadModel[];
    defs?: ParameterDefinitionReadModel[];
  } = {},
): QueryServices {
  const {
    fileId = 5,
    moduleDefId = 50,
    ckv = mockCkv,
    payloads = [mockPayload],
    defs = [mockDef],
  } = overrides;
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    spfModuleQueryService: {
      getSpfModule: jest.fn().mockResolvedValue({definitionSystemId: moduleDefId}),
      ckvQueryService: {
        getCkv: jest.fn().mockResolvedValue(ckv),
        getCkvPayloads: jest.fn().mockResolvedValue(payloads),
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

import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';

describe('GetCkvCalibrationDataHandler', () => {
  it('returns Result<CkvCalDataDto> with parsed parameters', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices());
    const query = new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id');
    const result = await handler.handle(query);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.systemId).toBe('10');
    expect(result.data.parameters).toHaveLength(1);
    expect(result.data.parameters[0].name).toBe('gain');
    expect(result.data.parameters[0].elements).not.toHaveLength(0);
    expect(result.data.parameters[0].elements[0]).toMatchObject({
      type: 'ConfigElement',
      name: 'gain',
      value: '5',
    });
    expect(CkvCalDataDtoSchema.safeParse(result.data).success).toBe(true);
  });

  it('throws NullPayloadError when payload is null', async () => {
    const handler = new GetCkvCalibrationDataHandler(
      makeServices({payloads: [{...mockPayload, payload: null}]}),
    );
    await expect(
      handler.handle(
        new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
      ),
    ).rejects.toThrow(NullPayloadError);
  });

  it('throws when CKV is not found', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices({ckv: null}));
    await expect(
      handler.handle(
        new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
      ),
    ).rejects.toThrow();
  });

  it('throws ParameterDefinitionMissingError when payload exists but definition is missing', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices({defs: []}));
    await expect(
      handler.handle(
        new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
      ),
    ).rejects.toThrow(ParameterDefinitionMissingError);
  });

  it('joins payloads to definitions by parameterSystemId → systemId', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(
      new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
    );
    // mockPayload.parameterSystemId = 100, mockDef.systemId = 100 → should match
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.parameters[0].parameterId).toBe('42');
  });
});
