/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Schema for custom module information.
 */
export const AwspCustomModuleInfoSchema = z.object({
  majorTypeID: z.number(),
  interfaceTypeID: z.number(),
  interfaceVersionID: z.number(),
  fileName: z.string(),
  entryPointTag: z.string(),
});

export type AwspCustomModuleInfo = z.infer<typeof AwspCustomModuleInfoSchema>;
