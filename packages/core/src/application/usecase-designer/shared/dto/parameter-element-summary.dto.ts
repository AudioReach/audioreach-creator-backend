/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/** Write-side element shape shared by module and Subgraph property commands. */
export const ConfigElementSummaryDtoSchema = z.object({
  type: z.literal('ConfigElement'),
  name: z.string().describe('Element name').optional(),
  value: z.unknown().describe('Value to write'),
});
export type ConfigElementSummaryDto = z.infer<
  typeof ConfigElementSummaryDtoSchema
>;

export const ElementTemplateArraySummaryDtoSchema = z.object({
  type: z.literal('ElementTemplateArray'),
  name: z.string().describe('Array element name').optional(),
  value: z.unknown().describe('Array value to write'),
});
export type ElementTemplateArraySummaryDto = z.infer<
  typeof ElementTemplateArraySummaryDtoSchema
>;

export const StructSummaryDtoSchema = z.object({
  type: z.literal('Struct'),
  name: z.string().describe('Struct element name').optional(),
  value: z.unknown().describe('Struct value to write'),
});
export type StructSummaryDto = z.infer<typeof StructSummaryDtoSchema>;

export const ParameterElementSummaryDtoSchema = z.discriminatedUnion('type', [
  ConfigElementSummaryDtoSchema,
  ElementTemplateArraySummaryDtoSchema,
  StructSummaryDtoSchema,
]);
export type ParameterElementSummaryDto = z.infer<
  typeof ParameterElementSummaryDtoSchema
>;
