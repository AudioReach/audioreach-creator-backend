/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspStaticControlPortSchema} from './static-control-port.schema.js';
import {AwspIntentSchema} from './intent.schema.js';

/**
 * Schema for control ports information.
 */
export const AwspControlPortsInfoSchema = z.object({
  staticPorts: z.array(AwspStaticControlPortSchema).optional(),
  dynamicIntents: z.array(AwspIntentSchema).optional(),
});

export type AwspControlPortsInfo = z.infer<typeof AwspControlPortsInfoSchema>;
