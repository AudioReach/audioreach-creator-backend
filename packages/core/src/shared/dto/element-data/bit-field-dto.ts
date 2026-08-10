/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {NameValuePairDtoSchema} from './name-value-pair-dto.js';

export const BitFieldDtoSchema = z.object({
  type: z
    .literal('BIT_FIELD')
    .describe('Discriminator identifying this entry as a bit field item'),
  bitMask: z.string().describe('Bit mask value'),
  name: z.string().describe('Bit field name'),
  description: z.string().optional().describe('Description of the bit field'),
  allowedValues: z
    .array(NameValuePairDtoSchema)
    .describe('Enumerated set of allowed values for this bit field'),
});

export type BitFieldDto = z.infer<typeof BitFieldDtoSchema>;
