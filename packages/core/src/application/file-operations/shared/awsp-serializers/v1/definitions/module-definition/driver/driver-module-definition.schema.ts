/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspParamDefinitionSchema} from '../common/param-definition.schema.js';
import {HexIdSchema, PositiveHexIdSchema} from '../../common/hex-id.schema.js';

export const AwspDriverModuleDefinitionSchema = z.object({
  id: PositiveHexIdSchema,
  name: z.string(),
  parameters: z.array(AwspParamDefinitionSchema).optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  replacedBy: HexIdSchema.optional(),
  deprecated: z.boolean().optional(),
  stubbed: z.boolean().optional(),
});

export type AwspDriverModuleDefinition = z.infer<
  typeof AwspDriverModuleDefinitionSchema
>;
