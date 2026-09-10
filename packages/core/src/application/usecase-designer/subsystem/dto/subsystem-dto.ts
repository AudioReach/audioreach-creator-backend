/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyInfoDtoSchema} from '../../../../shared/dto/key-value-info-dto.js';
import {
  ControlPortDtoSchema,
  mapControlPort,
} from '../../spf-module/query/spf-module-dto.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';

export const SubsystemDataPortDtoSchema = z.object({
  systemId: z.string().describe('Port system ID'),
  naturalId: z.number().int().describe('Port definition natural ID'),
  name: z.string().nullable().describe('Port name'),
  portIoType: z.enum(['InputOutput', 'OutputInput']).describe('Port IO type'),
  portType: z.enum(['Static', 'Dynamic']).describe('Port type'),
  totalLinksAtPort: z
    .number()
    .int()
    .describe('Number of active data links at this port'),
});

export type SubsystemDataPortDto = z.infer<typeof SubsystemDataPortDtoSchema>;

export function mapSubsystemDataPort(
  port: SubsystemReadModel['dataPorts'][number],
): SubsystemDataPortDto {
  return {
    systemId: String(port.systemId),
    naturalId: port.naturalId,
    name: port.name,
    portIoType:
      port.portIoType === PORT_IO_TYPE.InputOutput
        ? 'InputOutput'
        : 'OutputInput',
    portType: port.isStatic ? 'Static' : 'Dynamic',
    totalLinksAtPort: port.totalLinksAtPort,
  };
}
import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';

export const SubsystemDtoSchema = z.object({
  systemId: z.string().describe('System ID'),
  naturalId: z.number().int().describe('Component ID'),
  name: z.string().optional().describe('Subsystem name'),
  parentSystemId: z
    .string()
    .optional()
    .describe('System ID of the parent subsystem, if nested'),
  dataPorts: z.array(SubsystemDataPortDtoSchema).describe('Data ports'),
  controlPorts: z.array(ControlPortDtoSchema).describe('Control ports'),
  filteredKeys: z
    .array(KeyInfoDtoSchema)
    .describe('Filtered keys assigned to the subsystem'),
});

export type SubsystemDto = z.infer<typeof SubsystemDtoSchema>;

export function mapSubsystem(s: SubsystemReadModel): SubsystemDto {
  return {
    systemId: String(s.systemId),
    naturalId: s.naturalId,
    name: s.name,
    ...(s.parentSystemId === null
      ? {}
      : {parentSystemId: String(s.parentSystemId)}),
    dataPorts: s.dataPorts.map(port => mapSubsystemDataPort(port)),
    controlPorts: s.controlPorts.map(port => mapControlPort(port)),
    filteredKeys: s.filteredKeys.map(key => ({
      naturalId: key.naturalId,
      name: key.name,
      systemId: String(key.systemId),
    })),
  };
}
