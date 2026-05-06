/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseElementSchema} from '../common/base-element.schema.js';

/**
 * Zod schema for BasePropertyDefinition
 */
export const BasePropertyDefinitionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  maxSize: z.number().int().nonnegative().optional(),
  elements: z.array(BaseElementSchema),
});

export type BasePropertyDefinition = z.infer<
  typeof BasePropertyDefinitionSchema
>;
