/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ValueDefinitionSchema} from './value-definition.schema.js';
import {PositiveHexIdSchema} from '../common/hex-id.schema.js';

const SPECIALTY_VALUES = ['None', 'SampleRate', 'Volume'] as const;
type Specialty = (typeof SPECIALTY_VALUES)[number];

const specialtyOrdinalMap: Record<number, Specialty> = {
  0: 'None',
  1: 'SampleRate',
  2: 'Volume',
};

const SpecialtySchema = z.preprocess(val => {
  if (typeof val === 'number') {
    if (!(val in specialtyOrdinalMap)) {
      throw new Error(`Unknown specialty ordinal: ${val}`);
    }
    return specialtyOrdinalMap[val];
  }
  return val;
}, z.enum(SPECIALTY_VALUES).optional());

export const KeyDefinitionSchema = z.object({
  id: PositiveHexIdSchema,
  name: z.string().min(1),
  values: z.array(ValueDefinitionSchema),
  description: z.string().optional(),
  isVoice: z.boolean().optional(),
  isDynamic: z.boolean().optional(),
  specialty: SpecialtySchema,
  enumMember: z.string().optional(), // was: enumValue
  enumName: z.string().optional(),
  isGraphKey: z.boolean().optional(),
  graphKeyEnumMember: z.string().optional(), // was: graphKeyEnumValue
  isCalKey: z.boolean().optional(),
  calKeyEnumMember: z.string().optional(), // was: calKeyEnumValue
  isSPFKey: z.boolean().optional(),
});

export type KeyDefinition = z.infer<typeof KeyDefinitionSchema>;
