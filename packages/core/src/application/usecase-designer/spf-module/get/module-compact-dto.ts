/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const ModuleCompactDtoSchema = z.object({
  systemId: z.string().describe('Module system identifier'),
  name: z.string().describe('Module name'),
  alias: z.string().describe('Module alias'),
  isEnabled: z.boolean().describe('Whether the module is enabled'),
});

export type ModuleCompactDto = z.infer<typeof ModuleCompactDtoSchema>;
