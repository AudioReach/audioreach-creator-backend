/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  KeyInfoDtoSchema,
  DataPortDtoSchema,
  ControlPortDtoSchema,
  type KeyInfoDto,
  type DataPortDto,
  type ControlPortDto,
} from '../../spf-module/query/spf-module-dto.js';
import {
  ComponentCollectionWithSubsystemsDtoSchema,
  type ComponentCollectionWithSubsystemsDto,
} from '../../usecase/dto/component-collection-dto.js';

export type SubsystemDto = {
  systemId: string;
  id: number;
  name?: string;
  parentId?: number;
  dataPorts: DataPortDto[];
  controlPorts: ControlPortDto[];
  filteredKeys: KeyInfoDto[];
  children?: ComponentCollectionWithSubsystemsDto;
  relatedEndPointLinks?: unknown[];
};

export const SubsystemDtoSchema: z.ZodType<SubsystemDto> = z.lazy(() =>
  z.object({
    systemId: z.string().describe('System ID'),
    id: z.number().int().describe('Component ID'),
    name: z.string().optional().describe('Subsystem name'),
    parentId: z.number().int().optional().describe('Parent component ID'),
    dataPorts: z.array(DataPortDtoSchema).describe('Data ports'),
    controlPorts: z.array(ControlPortDtoSchema).describe('Control ports'),
    filteredKeys: z
      .array(KeyInfoDtoSchema)
      .describe('Filtered keys assigned to the subsystem'),
    children: ComponentCollectionWithSubsystemsDtoSchema.optional().describe(
      'Child components within this subsystem (includes nested subsystems)',
    ),
    relatedEndPointLinks: z
      .array(z.unknown())
      .optional()
      .describe('Related endpoint links'),
  }),
);
