/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  DataLinkDtoSchema,
  ControlLinkDtoSchema,
} from '../../usecase/dto/component-collection-dto.js';
import {
  DataPortDtoSchema,
  ControlPortDtoSchema,
} from '../../spf-module/query/spf-module-dto.js';

const UpdatedComponentItemSchema = z.object({
  systemId: z.string().describe('System ID of the component'),
  parentSystemId: z
    .string()
    .optional()
    .describe('New parent subsystem system ID. Absent if moved to root.'),
});

const SubsystemPortChangesSchema = z.object({
  systemId: z
    .string()
    .describe('System ID of the subsystem whose ports changed'),
  addedDataPorts: z
    .array(DataPortDtoSchema)
    .optional()
    .describe('Data ports added as a result of the move'),
  removedDataPorts: z
    .array(z.string())
    .optional()
    .describe('System IDs of data ports removed as a result of the move'),
  addedControlPorts: z
    .array(ControlPortDtoSchema)
    .optional()
    .describe('Control ports added as a result of the move'),
  removedControlPorts: z
    .array(z.string())
    .optional()
    .describe('System IDs of control ports removed as a result of the move'),
});

export const MoveSubsystemComponentsDtoSchema = z
  .object({
    updatedModules: z
      .array(UpdatedComponentItemSchema)
      .optional()
      .describe('Modules re-parented by the move'),
    updatedSubsystems: z
      .array(UpdatedComponentItemSchema)
      .optional()
      .describe('Subsystems re-parented by the move'),
    addedDataLinks: z
      .array(DataLinkDtoSchema)
      .optional()
      .describe('Data links constructed after the move'),
    removedDataLinks: z
      .array(z.string())
      .optional()
      .describe('System IDs of data links removed after the move'),
    addedControlLinks: z
      .array(ControlLinkDtoSchema)
      .optional()
      .describe('Control links constructed after the move'),
    removedControlLinks: z
      .array(z.string())
      .optional()
      .describe('System IDs of control links removed after the move'),
    subsystemPortChanges: z
      .array(SubsystemPortChangesSchema)
      .optional()
      .describe('Port changes resulting from the move'),
  })
  .describe('MoveSubsystemComponents');

export type MoveSubsystemComponentsDto = z.infer<
  typeof MoveSubsystemComponentsDtoSchema
>;
