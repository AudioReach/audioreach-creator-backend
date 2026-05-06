/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Zod schema for TagKeyDefinition
 */
export const TagKeyDefinitionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  enumValue: z.string().optional(),
});

export type TagKeyDefinition = z.infer<typeof TagKeyDefinitionSchema>;
