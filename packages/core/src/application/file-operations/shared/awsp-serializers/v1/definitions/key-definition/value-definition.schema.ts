/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Zod schema for ValueDefinition
 */
export const ValueDefinitionSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  description: z.string().optional(),
  enumValue: z.string().optional(),
  specialValue: z.string().optional(),
});

export type ValueDefinition = z.infer<typeof ValueDefinitionSchema>;
