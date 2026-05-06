/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Schema for intent definition.
 */
export const AwspIntentSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  maxports: z.number().optional(),
});

export type AwspIntent = z.infer<typeof AwspIntentSchema>;
