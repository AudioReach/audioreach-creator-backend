/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ElementUnionSchema} from './element-data/element-union.js';
import type {ElementUnion} from './element-data/element-union.js';
import type {ElementData} from '../../domain/entities/definitions/common/types/element-data.js';
import {PARAMETER_ELEMENT_TYPE} from '../../application/usecase-designer/shared/element-definition.js';
import type {PropertyDataDto} from '../../application/usecase-designer/shared/property-read-model.js';

export const PropertyDtoSchema = z
  .object({
    systemId: z.string().describe('System ID'),
    propertyId: z.number().int().describe('Property ID'),
    propertyName: z.string().describe('Property name'),
    hasDefinition: z.boolean().describe('Has definition or not'),
    elements: z
      .array(ElementUnionSchema)
      .optional()
      .describe(
        'Array of calibration elements for this property. Can contain ConfigElement, ElementTemplateArray, or Struct entries.',
      ),
  })
  .meta({id: 'PropertyDto'});

export type PropertyDto = z.infer<typeof PropertyDtoSchema>;

// ── Mappers ──────────────────────────────────────────────────────────────────

const DISPLAY_TYPE_MAP: Record<string, string> = {
  TEXTBOX: 'TEXT_BOX',
  DB_TEXTBOX: 'DB_TEXT_BOX',
  QFORMATTED_VALUE: 'Q_FORMATTED_VALUE',
  SLIDER: 'SLIDER',
  CHECKBOX: 'CHECK_BOX',
  DROPDOWN: 'DROP_DOWN',
  DUMP: 'DUMP',
  FILE: 'FILE',
  BITFIELD: 'BIT_FIELD',
  FORMULA: 'FORMULA',
  STRINGFIELD: 'STRING_FIELD',
};

function mapElements(elements: ElementData[]): ElementUnion[] {
  return elements.map(e => mapElement(e));
}

function mapElement(e: ElementData): ElementUnion {
  if (e.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
    return {
      type: 'CONFIG_ELEMENT',
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
      allowedValues: e.rangeList?.map(r => ({
        type: 'NAME_VALUE_PAIR' as const,
        name: r.name,
        value: r.value,
      })),
    } as ElementUnion;
  }
  if (e.type === PARAMETER_ELEMENT_TYPE.ElementArray) {
    return {
      type: 'ELEMENT_TEMPLATE_ARRAY',
      name: e.name,
      isReadOnly: e.isReadOnly,
      description: e.description,
      group: e.group,
      subgroup: e.subgroup,
      length: e.length,
      lengthFormula: e.arrayLenFormulaStr,
      template: mapElements(e.template),
      value: mapElements(e.value),
    } as ElementUnion;
  }
  return {
    type: 'STRUCT',
    name: e.name,
    isReadOnly: e.isReadOnly,
    description: e.description,
    group: e.group,
    subgroup: e.subgroup,
    structType: e.structType,
    value: mapElements(e.value),
  } as ElementUnion;
}

export function mapPropertyToDto(model: PropertyDataDto): PropertyDto {
  return {
    systemId: String(model.systemId),
    propertyId: model.propertyId,
    propertyName: model.propertyName,
    hasDefinition: true,
    elements: mapElements(model.elements),
  };
}
