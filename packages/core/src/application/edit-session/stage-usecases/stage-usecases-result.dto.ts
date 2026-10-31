/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const UsecaseChangesetResultSchema = z.object({
  success: z.boolean(),
  processedSystemIds: z.array(z.string()),
  failedSystemIds: z.array(z.string()),
  message: z.string(),
});

export type UsecaseChangesetResult = z.infer<
  typeof UsecaseChangesetResultSchema
>;
