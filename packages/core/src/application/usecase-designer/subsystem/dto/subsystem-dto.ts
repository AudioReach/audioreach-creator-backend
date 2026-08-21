/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  KeyInfoDtoSchema,
  DataPortDtoSchema,
  ControlPortDtoSchema,
} from '../../spf-module/query/spf-module-dto.js';

export const SubsystemDtoSchema = z.object({
  systemId: z.string().describe('System ID'),
  naturalId: z.number().int().describe('Component ID'),
  name: z.string().optional().describe('Subsystem name'),
  parentSystemId: z
    .string()
    .optional()
    .describe('System ID of the parent subsystem, if nested'),
  dataPorts: z.array(DataPortDtoSchema).describe('Data ports'),
  controlPorts: z.array(ControlPortDtoSchema).describe('Control ports'),
  filteredKeys: z
    .array(KeyInfoDtoSchema)
    .describe('Filtered keys assigned to the subsystem'),
});

export type SubsystemDto = z.infer<typeof SubsystemDtoSchema>;
