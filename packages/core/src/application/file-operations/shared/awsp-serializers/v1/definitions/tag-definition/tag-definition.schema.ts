/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {TagKeyDefinitionSchema} from './tag-key-definition.schema.js';

/**
 * Zod schema for TagDefinition
 * Includes nested TagKeyDefinition array
 */
export const TagDefinitionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  supportedKeys: z.array(TagKeyDefinitionSchema).optional(),
  isVoice: z.boolean().optional(),
  enumName: z.string().optional(),
  enumValue: z.string().optional(),
});

export type TagDefinition = z.infer<typeof TagDefinitionSchema>;
