/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ValueDefinitionSchema} from './value-definition.schema.js';

/**
 * Zod schema for KeyDefinition
 */
export const KeyDefinitionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  values: z.array(ValueDefinitionSchema),
  description: z.string().optional(),
  isVoice: z.boolean().optional(),
  isDynamic: z.boolean().optional(),
  specialty: z.string().optional(),
  enumValue: z.string().optional(),
  enumName: z.string().optional(),
  isGraphKey: z.boolean().optional(),
  graphKeyEnumValue: z.string().optional(),
  isCalKey: z.boolean().optional(),
  calKeyEnumValue: z.string().optional(),
});

export type KeyDefinition = z.infer<typeof KeyDefinitionSchema>;
