/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {HexIdSchema} from '../../common/hex-id.schema.js';

/**
 * Schema for port definition.
 */
export const AwspPortSchema = z.object({
  id: HexIdSchema,
  name: z.string().optional(),
});

export type AwspPort = z.infer<typeof AwspPortSchema>;
