/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyInfoDtoSchema} from '../../../../shared/dto/key-value-info-dto.js';
import {
  DataPortDtoSchema,
  ControlPortDtoSchema,
  mapDataPort,
  mapControlPort,
} from '../../spf-module/query/spf-module-dto.js';
import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';

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

export function mapSubsystem(s: SubsystemReadModel): SubsystemDto {
  if (s.subsystemNaturalId === undefined) {
    throw new Error(`Subsystem ${s.systemId} is missing its natural ID`);
  }

  return {
    systemId: String(s.systemId),
    naturalId: s.subsystemNaturalId,
    name: s.name,
    parentSystemId:
      s.parentSystemId === undefined ? undefined : String(s.parentSystemId),
    dataPorts: s.dataPorts.map(port => mapDataPort(port)),
    controlPorts: s.controlPorts.map(port => mapControlPort(port)),
    filteredKeys: s.filteredKeys.map(key => ({
      naturalId: key.naturalId,
      name: key.name,
      systemId: String(key.systemId),
    })),
  };
}
