/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {
  ElementData,
  ConfigElementData,
  ElementArrayData,
  StructData,
} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {PARAMETER_ELEMENT_TYPE} from '../../shared/element-definition.js';

export const NameValuePairSchema = z.object({
  name: z.string().describe('Display name'),
  value: z.string().describe('Encoded value'),
});

// Summary schemas — write-side shape (type + name + value only)
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

// Full read-side schemas — extend summary schemas to avoid duplicating type/name/value
export const ConfigElementSchema = ConfigElementSummaryDtoSchema.extend({
  value: z.string(),
  dataType: z.string(),
  isReadOnly: z.boolean(),
  description: z.string().optional(),
  group: z.string().optional(),
  subgroup: z.string().optional(),
  unit: z.string().optional(),
  displayType: z.string().optional(),
  policy: z.string().optional(),
  qFormat: z.string().optional(),
  precision: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  allowedValues: z.array(NameValuePairSchema).optional(),
});

// ElementTemplateArray and Struct use unknown[] for nested value/template to avoid infinite recursion
export const ElementTemplateArraySchema =
  ElementTemplateArraySummaryDtoSchema.extend({
    value: z.array(z.unknown()),
    isReadOnly: z.boolean(),
    template: z.array(z.unknown()),
    description: z.string().optional(),
    group: z.string().optional(),
    subgroup: z.string().optional(),
    length: z.number().optional(),
    lengthFormula: z.string().optional(),
  });

export const StructSchema = StructSummaryDtoSchema.extend({
  value: z.array(z.unknown()),
  isReadOnly: z.boolean(),
  structType: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
  subgroup: z.string().optional(),
});

export const ParameterElementDtoSchema = z.discriminatedUnion('type', [
  ConfigElementSchema,
  ElementTemplateArraySchema,
  StructSchema,
]);

export type ParameterElementDto = z.infer<typeof ParameterElementDtoSchema>;

const DISPLAY_TYPE_MAP: Record<string, string> = {
  TEXTBOX: 'TextBox',
  DB_TEXTBOX: 'DbTextBox',
  QFORMATTED_VALUE: 'QFormattedValue',
  SLIDER: 'Slider',
  CHECKBOX: 'CheckBox',
  DROPDOWN: 'DropDown',
  DUMP: 'Dump',
  FILE: 'File',
  BITFIELD: 'BitField',
  FORMULA: 'Formula',
  STRINGFIELD: 'StringField',
};

export function mapConfigElement(
  e: ConfigElementData,
): z.infer<typeof ConfigElementSchema> {
  return {
    type: 'ConfigElement',
    name: e.name,
    value: e.value,
    dataType: e.dataType as string,
    isReadOnly: e.isReadOnly,
    description: e.description,
    group: e.group,
    subgroup: e.subgroup,
    unit: e.unit,
    displayType: e.displayType
      ? DISPLAY_TYPE_MAP[e.displayType as string]
      : undefined,
    policy: e.policy,
    qFormat: e.qFormat,
    precision: e.precision,
    min: e.min,
    max: e.max,
    allowedValues: e.rangeList?.map(r => ({name: r.name, value: r.value})),
  };
}

export function mapElements(elements: ElementData[]): unknown[] {
  return elements.map(e => mapElement(e));
}

export function mapElement(e: ElementData): unknown {
  if (e.type === PARAMETER_ELEMENT_TYPE.ConfigElement)
    return mapConfigElement(e);
  if (e.type === PARAMETER_ELEMENT_TYPE.ElementArray) return mapElementArray(e);
  return mapStruct(e);
}

export function mapElementArray(
  e: ElementArrayData,
): z.infer<typeof ElementTemplateArraySchema> {
  return {
    type: 'ElementTemplateArray',
    name: e.name,
    isReadOnly: e.isReadOnly,
    description: e.description,
    group: e.group,
    subgroup: e.subgroup,
    length: e.length,
    lengthFormula: e.arrayLenFormulaStr,
    template: mapElements(e.template),
    value: mapElements(e.value),
  };
}

export function mapStruct(e: StructData): z.infer<typeof StructSchema> {
  return {
    type: 'Struct',
    name: e.name,
    isReadOnly: e.isReadOnly,
    description: e.description,
    group: e.group,
    subgroup: e.subgroup,
    structType: e.structType,
    value: mapElements(e.value),
  };
}
