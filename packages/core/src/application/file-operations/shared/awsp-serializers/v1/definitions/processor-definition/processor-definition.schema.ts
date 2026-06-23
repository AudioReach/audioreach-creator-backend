/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PositiveHexIdSchema} from '../common/hex-id.schema.js';

/**
 * Zod schema for ProcessorDefinition
 */
export const ProcessorDefinitionSchema = z.object({
  id: PositiveHexIdSchema,
  name: z.string().min(1),
});

export type ProcessorDefinition = z.infer<typeof ProcessorDefinitionSchema>;
