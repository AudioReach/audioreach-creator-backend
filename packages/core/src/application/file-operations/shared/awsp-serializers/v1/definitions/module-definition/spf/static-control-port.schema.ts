/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspPortSchema} from './port.schema.js';
import {AwspIntentSchema} from './intent.schema.js';

/**
 * Schema for static control port definition.
 * Extends port with supported intents.
 */
export const AwspStaticControlPortSchema = AwspPortSchema.extend({
  supportedIntents: z.array(AwspIntentSchema),
});

export type AwspStaticControlPort = z.infer<typeof AwspStaticControlPortSchema>;
