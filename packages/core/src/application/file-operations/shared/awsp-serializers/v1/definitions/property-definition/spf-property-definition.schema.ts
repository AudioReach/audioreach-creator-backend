/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BasePropertyDefinitionSchema} from './base-property-definition.schema.js';
import {PositiveHexIdSchema} from '../common/hex-id.schema.js';

/**
 * Zod schema for SpfPropertyDefinition
 * Extends BasePropertyDefinition with SPF-specific fields
 */
export const SpfPropertyDefinitionSchema = BasePropertyDefinitionSchema.extend({
  categoryId: PositiveHexIdSchema,
  categoryName: z.string().min(1),
  apmModuleInstanceId: PositiveHexIdSchema,
  isVoice: z.boolean().optional(),
});

export type SpfPropertyDefinition = z.infer<typeof SpfPropertyDefinitionSchema>;
