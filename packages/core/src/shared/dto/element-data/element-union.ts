/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  ConfigElementDtoSchema,
  type ConfigElementDto,
} from './config-element-dto.js';

// Forward-declared types for mutual recursion
export type ElementTemplateArrayDto = {
  type: 'ELEMENT_TEMPLATE_ARRAY';
  name: string;
  isReadOnly: boolean;
  template: ElementUnion[];
  value: ElementUnion[];
  description?: string;
  group?: string;
  subgroup?: string;
  length?: number;
  lengthFormula?: string;
};

export type StructDto = {
  type: 'STRUCT';
  name: string;
  isReadOnly: boolean;
  structType: string;
  value: ElementUnion[];
  description?: string;
  group?: string;
  subgroup?: string;
};

export type ElementUnion =
  | ConfigElementDto
  | ElementTemplateArrayDto
  | StructDto;

// Lazy schemas to handle mutual recursion — z.lazy() is required here because
// ElementTemplateArrayDtoSchema and StructDtoSchema reference each other and ElementUnionSchema.
export const ElementUnionSchema: z.ZodType<ElementUnion> = z
  .lazy(() =>
    z.union([
      ConfigElementDtoSchema,
      ElementTemplateArrayDtoSchema,
      StructDtoSchema,
    ]),
  )
  .meta({id: 'ElementUnion'});

export const ElementTemplateArrayDtoSchema: z.ZodType<ElementTemplateArrayDto> =
  z
    .lazy(() =>
      z.object({
        type: z
          .literal('ELEMENT_TEMPLATE_ARRAY')
          .describe(
            'Discriminator field identifying this as an ElementTemplateArray',
          ),
        name: z
          .string()
          .describe('Unique name of the array element within its parent scope'),
        isReadOnly: z
          .boolean()
          .describe(
            'When true, none of the array elements can be modified by the user',
          ),
        template: z
          .array(ElementUnionSchema)
          .describe(
            'Prototype elements defining the structure of each item in the array',
          ),
        value: z
          .array(ElementUnionSchema)
          .describe('Ordered list of concrete element instances in the array'),
        description: z
          .string()
          .optional()
          .describe('Human-readable description of what this array represents'),
        group: z
          .string()
          .optional()
          .describe('Logical group this array belongs to for UI organization'),
        subgroup: z
          .string()
          .optional()
          .describe(
            'Optional sub-group within the group for finer-grained UI organization',
          ),
        length: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Fixed number of elements in the array'),
        lengthFormula: z
          .string()
          .optional()
          .describe(
            'Expression evaluated at runtime to determine the array length',
          ),
      }),
    )
    .meta({id: 'ElementTemplateArrayDto'});

export const StructDtoSchema: z.ZodType<StructDto> = z
  .lazy(() =>
    z.object({
      type: z
        .literal('STRUCT')
        .describe('Discriminator field identifying this as a Struct'),
      name: z
        .string()
        .describe('Unique name of the struct element within its parent scope'),
      isReadOnly: z
        .boolean()
        .describe(
          'When true, none of the struct elements can be modified by the user',
        ),
      structType: z
        .string()
        .describe(
          'Type identifier for the struct, corresponding to the named struct type in the module definition',
        ),
      value: z
        .array(ElementUnionSchema)
        .describe('Child elements contained within this struct'),
      description: z
        .string()
        .optional()
        .describe('Human-readable description of what this struct represents'),
      group: z
        .string()
        .optional()
        .describe('Logical group this struct belongs to for UI organization'),
      subgroup: z
        .string()
        .optional()
        .describe(
          'Optional sub-group within the group for finer-grained UI organization',
        ),
    }),
  )
  .meta({id: 'StructDto'});
