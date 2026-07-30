/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  type ElementData,
  type ConfigElementData,
  type ElementArrayData,
  type StructData,
  type DisplayType,
  type PropertyDataDto,
  PARAMETER_ELEMENT_TYPE,
} from '@arc/core';
import {ConfigElementDto} from '../dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../dto/element-data/elements/struct.dto.js';
import {NameValuePairDto} from '../dto/element-data/elements/config-element/name-value-pair.dto.js';
import {DISPLAY_TYPE} from '../dto/element-data/elements/config-element/types/display-type.js';
import {PropertyDto} from '../dto/index.js';

export type ElementDtoUnion =
  | ConfigElementDto
  | ElementTemplateArrayDto
  | StructDto;

export function mapPropertyToDto(model: PropertyDataDto): PropertyDto {
  const dto = new PropertyDto(
    String(model.systemId),
    model.propertyId,
    model.propertyName,
  );
  dto.elements = model.elements.map(e => transformElement(e));
  return dto;
}

export function transformElements(elements: ElementData[]): ElementDtoUnion[] {
  return elements.map(e => transformElement(e));
}

export function transformElement(element: ElementData): ElementDtoUnion {
  if (element.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
    return transformConfigElement(element);
  }
  if (element.type === PARAMETER_ELEMENT_TYPE.ElementArray) {
    return transformElementArray(element);
  }
  return transformStruct(element);
}

export function mapDisplayType(
  raw: DisplayType | undefined,
): ConfigElementDto['displayType'] | undefined {
  if (!raw) return undefined;
  const map: Record<DisplayType, ConfigElementDto['displayType']> = {
    TEXTBOX: DISPLAY_TYPE.TextBox,
    DB_TEXTBOX: DISPLAY_TYPE.DbTextBox,
    QFORMATTED_VALUE: DISPLAY_TYPE.QFormattedValue,
    SLIDER: DISPLAY_TYPE.Slider,
    CHECKBOX: DISPLAY_TYPE.CheckBox,
    DROPDOWN: DISPLAY_TYPE.DropDown,
    DUMP: DISPLAY_TYPE.Dump,
    FILE: DISPLAY_TYPE.File,
    BITFIELD: DISPLAY_TYPE.BitField,
    FORMULA: DISPLAY_TYPE.Formula,
    STRINGFIELD: DISPLAY_TYPE.StringField,
  };
  return map[raw];
}

export function transformConfigElement(e: ConfigElementData): ConfigElementDto {
  const dto = new ConfigElementDto();
  dto.name = e.name;
  dto.value = e.value;
  dto.dataType = e.dataType as ConfigElementDto['dataType'];
  dto.description = e.description;
  dto.group = e.group;
  dto.subgroup = e.subgroup;
  dto.isReadOnly = e.isReadOnly;
  dto.unit = e.unit;
  dto.displayType = mapDisplayType(e.displayType);
  dto.policy = e.policy as ConfigElementDto['policy'];
  dto.qFormat = e.qFormat;
  dto.precision = e.precision;
  dto.min = e.min;
  dto.max = e.max;
  dto.allowedValues = e.rangeList?.map(r => {
    const nv = new NameValuePairDto();
    nv.name = r.name;
    nv.value = r.value;
    return nv;
  });
  return dto;
}

export function transformElementArray(
  e: ElementArrayData,
): ElementTemplateArrayDto {
  const dto = new ElementTemplateArrayDto();
  dto.name = e.name;
  dto.isReadOnly = e.isReadOnly;
  dto.description = e.description;
  dto.group = e.group;
  dto.subgroup = e.subgroup;
  dto.length = e.length;
  dto.lengthFormula = e.arrayLenFormulaStr;
  dto.template = transformElements(e.template);
  dto.value = transformElements(e.value);
  return dto;
}

export function transformStruct(e: StructData): StructDto {
  const dto = new StructDto();
  dto.name = e.name;
  dto.isReadOnly = e.isReadOnly;
  dto.description = e.description;
  dto.group = e.group;
  dto.subgroup = e.subgroup;
  dto.structType = e.structType;
  dto.value = transformElements(e.value);
  return dto;
}
