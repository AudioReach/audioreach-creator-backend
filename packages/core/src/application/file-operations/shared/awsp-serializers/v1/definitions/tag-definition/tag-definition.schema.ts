/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {TagKeyDefinitionSchema} from './tag-key-definition.schema.js';
import {PositiveHexIdSchema} from '../common/hex-id.schema.js';

export const TagDefinitionSchema = z.object({
  id: PositiveHexIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  keys: z.array(TagKeyDefinitionSchema).optional(), // was: supportedKeys
  isVoice: z.boolean().optional(),
  enumName: z.string().optional(),
  enumMember: z.string().optional(), // was: enumValue
  isSpfTag: z.boolean().optional(),
});

export type TagDefinition = z.infer<typeof TagDefinitionSchema>;
