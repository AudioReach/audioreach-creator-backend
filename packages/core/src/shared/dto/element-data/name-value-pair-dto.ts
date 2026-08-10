/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const NameValuePairDtoSchema = z.object({
  type: z
    .literal('NAME_VALUE_PAIR')
    .describe(
      'Discriminator identifying this entry as an allowed value option',
    ),
  name: z.string().describe('Human-readable name for this allowed value'),
  value: z.string().describe('The actual value'),
});

export type NameValuePairDto = z.infer<typeof NameValuePairDtoSchema>;
