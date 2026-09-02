/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {
  mapTkvCalDataDto,
  TkvCalDataDtoSchema,
} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
import type {TkvReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterCalibrationReadModel} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-calibration-read-model.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/shared/element-definition.js';

const mockTkv: TkvReadModel = {
  systemId: 10,
  moduleTagIdMapSystemId: 5,
  keyValuePairs: [
    {
      key: {keyId: 1, name: 'ch', systemId: 100},
      value: {valueId: 2, name: 'stereo', systemId: 200},
    },
  ],
};

const mockParam: ParameterCalibrationReadModel = {
  systemId: 20,
  parameterId: 42,
  name: 'gain',
  description: 'Gain param',
  isReadOnly: false,
  isHidden: undefined,
  pidType: 'PARAM_ID_GAIN' as any,
  parsedData: [
    {
      type: PARAMETER_ELEMENT_TYPE.ConfigElement,
      name: 'gain',
      dataType: 'UInt32',
      isReadOnly: false,
      value: '5',
    },
  ],
};

describe('mapTkvCalDataDto', () => {
  it('maps TkvReadModel + parameters to TkvCalDataDto', () => {
    const dto = mapTkvCalDataDto(mockTkv, [mockParam]);
    expect(dto.systemId).toBe('10');
    expect(dto.Tkv).toHaveLength(1);
    expect(dto.Tkv[0].key.keyId).toBe(1);
    expect(dto.Tkv[0].key.name).toBe('ch');
    expect(dto.Tkv[0].value.name).toBe('stereo');
    expect(dto.parameters).toHaveLength(1);
    expect(dto.parameters[0].name).toBe('gain');
  });

  it('returns empty Tkv array when keyValuePairs is empty', () => {
    const dto = mapTkvCalDataDto({...mockTkv, keyValuePairs: []}, []);
    expect(dto.Tkv).toHaveLength(0);
    expect(dto.parameters).toHaveLength(0);
  });

  it('serialises systemId as string', () => {
    const dto = mapTkvCalDataDto(mockTkv, []);
    expect(typeof dto.systemId).toBe('string');
    expect(dto.systemId).toBe('10');
  });

  it('produces output that passes TkvCalDataDtoSchema validation', () => {
    const dto = mapTkvCalDataDto(mockTkv, [mockParam]);
    const result = TkvCalDataDtoSchema.safeParse(dto);
    expect(result.success).toBe(true);
  });
});
