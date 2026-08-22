/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspParamDefinitionSchema} from '../common/param-definition.schema.js';
import {AwspDataPortsInfoSchema} from './data-ports-info.schema.js';
import {AwspControlPortsInfoSchema} from './control-ports-info.schema.js';
import {AwspCustomModuleInfoSchema} from './custom-module-info.schema.js';
import {HexIdSchema, PositiveHexIdSchema} from '../../common/hex-id.schema.js';

const parseHexId = (val: unknown): number =>
  typeof val === 'string' && /^0x[0-9a-f]+$/i.test(val)
    ? Number.parseInt(val, 16)
    : Number(val);

// processors/containerTypes arrive as [{id: HexId}, ...] from the workspace file
// or as plain number[] from serialized/test data; coerce both to number[].
const IdObjectArraySchema = z.preprocess(
  val =>
    Array.isArray(val)
      ? val.map((p: unknown) =>
          typeof p === 'object' && p !== null && 'id' in p
            ? parseHexId((p as {id: unknown}).id)
            : Number(p),
        )
      : val,
  z.array(z.number()),
);

export const AwspSpfModuleDefinitionSchema = z.object({
  id: PositiveHexIdSchema,
  name: z.string(),
  parameters: z.array(AwspParamDefinitionSchema).optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  replacedBy: HexIdSchema.optional(),
  deprecated: z.boolean().optional(),
  processors: IdObjectArraySchema.optional(),
  containerTypes: IdObjectArraySchema.optional(),
  inputPort: AwspDataPortsInfoSchema.optional(),
  outputPort: AwspDataPortsInfoSchema.optional(),
  controlPort: AwspControlPortsInfoSchema.optional(),
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
  customModule: AwspCustomModuleInfoSchema.optional(),
  groupName: z.string().optional(),
  rtmLogCode: z.string().optional(),
  hasNeuralNetParam: z.boolean().optional(),
});

export type AwspSpfModuleDefinition = z.infer<
  typeof AwspSpfModuleDefinitionSchema
>;
