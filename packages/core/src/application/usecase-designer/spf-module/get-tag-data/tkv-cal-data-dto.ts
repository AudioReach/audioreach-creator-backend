/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ParameterDtoSchema} from '../dto/parameter-dto.js';
import {mapParameterCalibrationToDto} from '../get-cal-data/ckv-cal-data-dto.js';
import type {ParameterCalibrationReadModel} from './tkv-calibration-read-model.js';
import type {TkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';

const TkvKeyValuePairSchema = z.object({
  key: z.object({
    keyId: z.number().int().describe('Key definition ID'),
    name: z.string().describe('Key name'),
    systemId: z.string().describe('Key system ID'),
  }),
  value: z.object({
    valueId: z.number().int().describe('Value definition ID'),
    name: z.string().describe('Value name'),
    systemId: z.string().describe('Value system ID'),
  }),
});

export const TkvCalDataDtoSchema = z.object({
  systemId: z.string().describe('TKV system ID'),
  Tkv: z.array(TkvKeyValuePairSchema).describe('Tag key-value pairs'),
  parameters: z.array(ParameterDtoSchema).describe('Parameter tag data'),
});

export type TkvCalDataDto = z.infer<typeof TkvCalDataDtoSchema>;

export function mapTkvCalDataDto(
  tkv: TkvReadModel,
  parameters: ParameterCalibrationReadModel[],
): TkvCalDataDto {
  return {
    systemId: tkv.systemId.toString(),
    Tkv: (tkv.keyValuePairs ?? []).map(kv => ({
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
