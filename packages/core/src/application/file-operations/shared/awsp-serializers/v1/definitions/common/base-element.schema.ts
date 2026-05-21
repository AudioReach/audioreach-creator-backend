/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Base schema for all definition elements
 * Uses a permissive schema for now to handle polymorphic types
 * This will be refined in future phases to use discriminated unions
 */
export const BaseElementSchema = z
  .object({
    elementType: z.string(),
    name: z.string(),
    description: z.string().optional(),
    channel: z.number().optional(),
    groupSet: z.number().optional(),
    alignment: z.number().optional(),
    rtmPlotType: z.string().optional(),
    group: z.string().optional(),
    subGroup: z.string().optional(),
    copySrc: z.string().optional(),
  })
  .catchall(z.unknown()); // Allow additional properties for different element types

export type BaseElement = z.infer<typeof BaseElementSchema>;
