/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BasePropertyDefinitionSchema} from './base-property-definition.schema.js';

/**
 * Zod schema for SpfPropertyDefinition
 * Extends BasePropertyDefinition with SPF-specific fields
 */
export const SpfPropertyDefinitionSchema = BasePropertyDefinitionSchema.extend({
  categoryId: z.number().int().positive(),
  categoryName: z.string().min(1),
  apmModuleInstanceId: z.number().int().positive(),
  isVoice: z.boolean().optional(),
});

export type SpfPropertyDefinition = z.infer<typeof SpfPropertyDefinitionSchema>;
