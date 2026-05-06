/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspParamDefinitionSchema} from './param-definition.schema.js';

/**
 * Schema for base module definition.
 * Contains common properties shared between SPF and Driver module definitions.
 */
export const BaseModuleDefinitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  paramDefinitions: z.array(AwspParamDefinitionSchema).optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  replacedBy: z.number().optional(),
  deprecated: z.boolean().optional(),
});

export type BaseModuleDefinition = z.infer<typeof BaseModuleDefinitionSchema>;
