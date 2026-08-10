/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {NameValuePairDtoSchema} from './name-value-pair-dto.js';
import {BitFieldDtoSchema} from './bit-field-dto.js';

export const ConfigElementDtoSchema = z.object({
  type: z
    .literal('CONFIG_ELEMENT')
    .describe('Discriminator field identifying this as a ConfigElement'),
  name: z
    .string()
    .describe('Unique name of the element within its parent scope'),
  value: z.string().describe('Current value of the element as a string'),
  dataType: z
    .enum([
      'UInt8',
      'UInt16',
      'UInt32',
      'UInt64',
      'Int8',
      'Int16',
      'Int32',
      'Int64',
      'RawData',
      'Double',
      'Float',
    ])
    .describe('Data type of the element value'),
  isReadOnly: z
    .boolean()
    .describe('When true, the element value cannot be modified by the user'),
  description: z
    .string()
    .optional()
    .describe(
      'Human-readable description of what this element controls or represents',
    ),
  group: z
    .string()
    .optional()
    .describe('Logical group this element belongs to'),
  subgroup: z
    .string()
    .optional()
    .describe(
      'Optional sub-group within the group for finer-grained UI organization',
    ),
  unit: z
    .string()
    .optional()
    .describe('Unit of measurement for the value (e.g. dB, Hz, ms)'),
  displayType: z
    .enum([
      'TEXT_BOX',
      'DB_TEXT_BOX',
      'Q_FORMATTED_VALUE',
      'SLIDER',
      'CHECK_BOX',
      'DROP_DOWN',
      'DUMP',
      'FILE',
      'BIT_FIELD',
      'FORMULA',
      'STRING_FIELD',
    ])
    .optional()
    .describe('Hint for how the element should be rendered in the UI'),
  policy: z
    .enum(['HIDDEN', 'BASIC', 'ADVANCED'])
    .optional()
    .describe('Visibility and access-control policy for this element'),
  qFormat: z
    .string()
    .optional()
    .describe(
      'Q-format notation string indicating the fixed-point scaling of the value',
    ),
  precision: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of decimal places to display when rendering the value'),
  min: z.number().optional().describe('Minimum allowed value for this element'),
  max: z.number().optional().describe('Maximum allowed value for this element'),
  allowedValues: z
    .array(
      z.discriminatedUnion('type', [NameValuePairDtoSchema, BitFieldDtoSchema]),
    )
    .optional()
    .describe('Enumerated set of allowed values the client may choose from'),
  linkedElementNames: z
    .array(z.string())
    .optional()
    .describe('List of element names that are linked to this element'),
});

export type ConfigElementDto = z.infer<typeof ConfigElementDtoSchema>;
