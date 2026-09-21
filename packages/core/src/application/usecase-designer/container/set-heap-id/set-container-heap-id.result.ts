/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const SetContainerHeapIdResultSchema = z.object({
  containerSystemId: z.number().int(),
  heapId: z.number().int(),
  updatedModuleHeapIds: z.array(
    z.object({
      moduleSystemId: z.number().int(),
      heapId: z.number().int(),
    }),
  ),
});

export type SetContainerHeapIdResult = z.infer<
  typeof SetContainerHeapIdResultSchema
>;
