/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseModuleDefinitionSchema} from '../common/base-module-definition.schema.js';

/**
 * Schema for VCPM module definition.
 * Extends BaseModuleDefinition with stubbed flag.
 */
export const AwspVcpmModuleDefinitionSchema = BaseModuleDefinitionSchema.extend(
  {
    stubbed: z.boolean().optional(),
  },
);

export type AwspVcpmModuleDefinitionType =
  typeof AwspVcpmModuleDefinitionSchema;
