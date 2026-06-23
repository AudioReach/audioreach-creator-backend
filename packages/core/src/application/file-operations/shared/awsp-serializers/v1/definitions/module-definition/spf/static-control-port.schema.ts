/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {HexIdSchema} from '../../common/hex-id.schema.js';
import {AwspIntentSchema} from './intent.schema.js';

/**
 * Schema for static control port definition.
 * Extends port with supported intents (optional — absent in some JSON variants).
 */
export const AwspStaticControlPortSchema = z.object({
  id: HexIdSchema,
  name: z.string().optional(),
  supportedIntents: z.array(AwspIntentSchema).optional(),
});

export type AwspStaticControlPort = z.infer<typeof AwspStaticControlPortSchema>;
