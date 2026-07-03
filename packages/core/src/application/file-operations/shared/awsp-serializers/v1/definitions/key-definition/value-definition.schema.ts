/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {HexIdSchema} from '../common/hex-id.schema.js';

/**
 * Zod schema for ValueDefinition
 */
export const ValueDefinitionSchema = z.object({
  id: HexIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  enumMember: z.string().optional(),
  specialValue: z.string().optional(),
});

export type ValueDefinition = z.infer<typeof ValueDefinitionSchema>;
