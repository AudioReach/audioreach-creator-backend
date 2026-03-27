/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Arc data type values
 */
export enum DataTypeEnum {
  UInt8 = 'UInt8',
  UInt16 = 'UInt16',
  UInt32 = 'UInt32',
  UInt64 = 'UInt64',
  Int8 = 'Int8',
  Int16 = 'Int16',
  Int32 = 'Int32',
  Int64 = 'Int64',
  RawData = 'RawData',
  Double = 'Double',
  Float = 'Float',
}

/**
 * Arc display type values
 */
export enum DisplayTypeEnum {
  TextBox = 'TextBox',
  DbTextBox = 'DbTextBox',
  QFormattedValue = 'QFormattedValue',
  Slider = 'Slider',
  CheckBox = 'CheckBox',
  DropDown = 'DropDown',
  Dump = 'Dump',
  File = 'File',
  BitField = 'BitField',
  Formula = 'Formula',
  StringField = 'StringField',
}

/**
 * Element policy values
 */
export enum ElementPolicyEnum {
  Hidden = 'Hidden',
  Basic = 'Basic',
  Advanced = 'Advanced',
}

/**
 * Element type identifier
 */
export enum DefinitionElementTypeEnum {
  ConfigElement = 'ConfigElement',
  ConfigElementArray = 'ConfigElementArray',
  Struct = 'Struct',
  StructArray = 'StructArray',
}

/**
 * Base properties for all definition elements
 */
export type DefinitionElementBase = {
  elementType: DefinitionElementTypeEnum;
  name: string;
  description?: string;
  channel?: number;
  groupSet?: number;
  alignment?: number;
  rtmPlotType?: string;
  group?: string;
  subGroup?: string;
  copySrc?: string;
};

/**
 * Configuration element DTO for parameter/property definitions
 */
export class DefinitionConfigElementDto implements DefinitionElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Data type of the configuration element',
    enum: Object.values(DataTypeEnum),
  })
  dataType!: DataTypeEnum;

  @ApiProperty({
    description: 'Default value for the configuration element',
  })
  defaultValue!: string;

  @ApiProperty({
    description: 'Display type for UI rendering',
    enum: Object.values(DisplayTypeEnum),
    required: false,
  })
  displayType?: DisplayTypeEnum;

  @ApiProperty({
    description: 'Element policy for visibility and access control',
    enum: Object.values(ElementPolicyEnum),
    required: false,
  })
  policy?: ElementPolicyEnum;

  @ApiProperty({
    description: 'Whether the element is read-only',
    required: false,
  })
  isReadOnly?: boolean;

  @ApiProperty({
    description: 'Display name for the configuration element',
    required: false,
  })
  displayName?: string;

  @ApiProperty({
    description: 'Unit of measurement',
    required: false,
  })
  unitStr?: string;

  @ApiProperty({
    description: 'Q format string for fixed-point representation',
    required: false,
  })
  qFormat?: string;

  @ApiProperty({
    description: 'Precision value for decimal places',
    minimum: 0,
    required: false,
  })
  precision?: number;

  @ApiProperty({
    description: 'List of elements linked by formula',
    type: [String],
    required: false,
  })
  linkedByForFormula?: string[];

  @ApiProperty({
    description: 'List of default data dependencies',
    type: [String],
    required: false,
  })
  defaultDataDepends?: string[];
}

/**
 * Configuration element array DTO for parameter/property definitions
 */
export class DefinitionConfigElementArrayDto implements DefinitionElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Array length',
    minimum: 0,
  })
  arrayLength!: number;

  @ApiProperty({
    description: 'Array length formula string',
  })
  arrayLenFormulaStr!: string;

  @ApiProperty({
    description: 'List of copy source information',
    type: [String],
  })
  copySrcInfoList!: string[];

  @ApiProperty({
    description: 'Key configuration element defining the array item structure',
    type: () => DefinitionConfigElementDto,
  })
  keyConfigElement!: DefinitionConfigElementDto;

  @ApiProperty({
    description: 'Display type for the configuration element array',
    enum: Object.values(DisplayTypeEnum),
    required: false,
  })
  displayType?: DisplayTypeEnum;

  @ApiProperty({
    description: 'Element policy for visibility and access control',
    enum: Object.values(ElementPolicyEnum),
    required: false,
  })
  policy?: ElementPolicyEnum;

  @ApiProperty({
    description: 'Whether the element array is read-only',
    required: false,
  })
  isReadOnly?: boolean;
}

/**
 * Structure element DTO for parameter/property definitions
 */
export class DefinitionStructDto implements DefinitionElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Structure type identifier',
  })
  structureType!: string;

  @ApiProperty({
    description: 'Child elements within the structure',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/DefinitionConfigElementDto'},
        {$ref: '#/components/schemas/DefinitionConfigElementArrayDto'},
        {$ref: '#/components/schemas/DefinitionStructDto'},
      ],
    },
  })
  children!: DefinitionElementDto[];
}

/**
 * Structure array DTO for parameter/property definitions
 */
export class DefinitionStructArrayDto implements DefinitionElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Array length',
    minimum: 0,
  })
  arrayLength!: number;

  @ApiProperty({
    description: 'Array length formula string',
  })
  arrayLenFormulaStr!: string;

  @ApiProperty({
    description: 'List of copy source information',
    type: [String],
  })
  copySrcInfoList!: string[];

  @ApiProperty({
    description: 'Key structure definition for array items',
    type: () => DefinitionStructDto,
  })
  keyStructureDefinition!: DefinitionStructDto;
}

/**
 * Union type for all possible definition element types
 */
export type DefinitionElementDto =
  | DefinitionConfigElementDto
  | DefinitionConfigElementArrayDto
  | DefinitionStructDto
  | DefinitionStructArrayDto;
