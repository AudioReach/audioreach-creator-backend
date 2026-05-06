/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseModuleDefinitionSchema} from '../common/base-module-definition.schema.js';

/**
 * Schema for Driver module definition.
 * Extends BaseModuleDefinition with driver-specific properties.
 */
export const AwspDriverModuleDefinitionSchema =
  BaseModuleDefinitionSchema.extend({
    stubbed: z.boolean().optional(),
  });

export type AwspDriverModuleDefinition = z.infer<
  typeof AwspDriverModuleDefinitionSchema
>;
