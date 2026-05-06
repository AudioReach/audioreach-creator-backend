/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Zod schema for ContainerType definition
 */
export const ContainerTypeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export type ContainerType = z.infer<typeof ContainerTypeSchema>;
