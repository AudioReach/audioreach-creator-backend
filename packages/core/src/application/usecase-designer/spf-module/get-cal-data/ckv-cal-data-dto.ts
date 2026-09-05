/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ParameterDtoSchema, type ParameterDto} from '../dto/parameter-dto.js';
import {mapElements} from '../dto/element-dto.js';
import type {ParameterElementDto} from '../dto/element-dto.js';
import {mapToElementData} from '../../shared/serialize-elements.js';
import type {ParameterCalibrationReadModel} from './ckv-calibration-read-model.js';
import type {CkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';

export {
  mapConfigElement,
  mapElements,
  mapElement,
  mapElementArray,
  mapStruct,
} from '../dto/element-dto.js';

const CkvKeyValuePairSchema = z.object({
  key: z.object({
    keyId: z.number().int(),
    name: z.string(),
    systemId: z.string(),
  }),
  value: z.object({
    valueId: z.number().int(),
    name: z.string(),
    systemId: z.string(),
  }),
});

export const CkvCalDataDtoSchema = z.object({
  systemId: z.string().describe('CKV system ID'),
  Ckv: z.array(CkvKeyValuePairSchema).describe('Calibration key-value pairs'),
  parameters: z
    .array(ParameterDtoSchema)
    .describe('Parameter calibration data'),
});

export type CkvCalDataDto = z.infer<typeof CkvCalDataDtoSchema>;

export function mapParameterCalibrationToDto(
  p: ParameterCalibrationReadModel,
): ParameterDto {
  return {
    systemId: p.systemId.toString(),
    parameterId: p.parameterId.toString(),
    name: p.name,
    description: p.description,
    isHidden: p.isHidden,
    isReadOnly: p.isReadOnly,
    pidType: p.pidType as string | undefined,
    elements: p.parsedData
      ? (mapElements(p.parsedData) as ParameterDto['elements'])
      : [],
  };
}

export function mapCkvCalDataDto(
  ckv: CkvReadModel,
  parameters: ParameterCalibrationReadModel[],
): CkvCalDataDto {
  return {
    systemId: ckv.systemId.toString(),
    Ckv: (ckv.keyValuePairs ?? []).map(kv => ({
      key: {
        keyId: kv.key.keyId,
        name: kv.key.name,
        systemId: String(kv.key.systemId),
      },
      value: {
        valueId: kv.value.valueId,
        name: kv.value.name,
        systemId: String(kv.value.systemId),
      },
    })),
    parameters: parameters.map(p => mapParameterCalibrationToDto(p)),
  };
}

export function mapDtoToParameterCalibration(
  elements: ParameterElementDto[],
) {
  // ParameterElementDto uses unknown[] for nested elements (Zod circular-schema
  // workaround); the serializer accepts both 'ElementArray' and
  // 'ElementTemplateArray' discriminators so the cast is safe at runtime.
  return mapToElementData(elements);
}
