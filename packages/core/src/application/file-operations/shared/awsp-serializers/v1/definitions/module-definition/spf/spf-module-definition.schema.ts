/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseModuleDefinitionSchema} from '../common/base-module-definition.schema.js';
import {AwspDataPortsInfoSchema} from './data-ports-info.schema.js';
import {AwspControlPortsInfoSchema} from './control-ports-info.schema.js';
import {AwspCustomModuleInfoSchema} from './custom-module-info.schema.js';

/**
 * Schema for SPF module definition.
 * Extends BaseModuleDefinition with SPF-specific properties.
 */
export const AwspSpfModuleDefinitionSchema = BaseModuleDefinitionSchema.extend({
  supportedProcessorIds: z.array(z.number()).optional(), //TODO: fix this
  supportedContainerTypes: z.array(z.number()).optional(), //TODO: fix this
  inputPortsInfo: AwspDataPortsInfoSchema.optional(),
  outputPortsInfo: AwspDataPortsInfoSchema.optional(),
  controlPortsInfo: AwspControlPortsInfoSchema.optional(),
  stackSize: z.number().optional(),
  vocoderModuleType: z.string().optional(),
  directionType: z.string().optional(),
  mdfModuleType: z.string().optional(),
  searchKeys: z.string().optional(),
  isOffloadable: z.boolean().optional(),
  builtIn: z.boolean().optional(),
  majorModuleType: z.string().optional(),
  buildType: z.string().optional(),
  islandFriendly: z.boolean().optional(),
  customModuleInfo: AwspCustomModuleInfoSchema.optional(),
  groupName: z.string().optional(),
  rtmLogCode: z.string().optional(),
  hasNeuralNetParam: z.boolean().optional(),
});

export type AwspSpfModuleDefinition = z.infer<
  typeof AwspSpfModuleDefinitionSchema
>;
