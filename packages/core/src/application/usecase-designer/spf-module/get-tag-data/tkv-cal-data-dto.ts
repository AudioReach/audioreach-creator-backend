/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ParameterDtoSchema} from '../dto/parameter-dto.js';

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
