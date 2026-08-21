/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const SubsystemSnapshotDtoSchema = z.object({
  systemId: z.string().describe('System-generated unique identifier'),
  naturalId: z
    .number()
    .int()
    .positive()
    .describe('Sequential natural subsystem ID'),
  name: z.string().describe('Assigned or auto-generated subsystem name'),
  parentSystemId: z
    .string()
    .optional()
    .describe('System ID of the parent subsystem, if nested'),
});

export type SubsystemSnapshotDto = z.infer<typeof SubsystemSnapshotDtoSchema>;
