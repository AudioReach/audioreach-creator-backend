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
    example: 'ConfigElement',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'volume_level',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Audio volume level setting',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    example: 0,
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    example: 0,
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    example: 4,
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    example: 'Line',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Audio Controls',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Volume Settings',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    example: 'source_element',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Data type of the configuration element',
    enum: Object.values(DataTypeEnum),
    example: 'UInt32',
  })
  dataType!: DataTypeEnum;

  @ApiProperty({
    description: 'Default value for the configuration element',
    example: '75',
  })
  defaultValue!: string;

  @ApiProperty({
    description: 'Display type for UI rendering',
    enum: Object.values(DisplayTypeEnum),
    example: 'Slider',
    required: false,
  })
  displayType?: DisplayTypeEnum;

  @ApiProperty({
    description: 'Element policy for visibility and access control',
    enum: Object.values(ElementPolicyEnum),
    example: 'Basic',
    required: false,
  })
  policy?: ElementPolicyEnum;

  @ApiProperty({
    description: 'Whether the element is read-only',
    example: false,
    required: false,
  })
  isReadOnly?: boolean;

  @ApiProperty({
    description: 'Display name for the configuration element',
    example: 'Volume Level',
    required: false,
  })
  displayName?: string;

  @ApiProperty({
    description: 'Unit of measurement',
    example: 'dB',
    required: false,
  })
  unitStr?: string;

  @ApiProperty({
    description: 'Q format string for fixed-point representation',
    example: 'Q15',
    required: false,
  })
  qFormat?: string;

  @ApiProperty({
    description: 'Precision value for decimal places',
    example: 2,
    minimum: 0,
    required: false,
  })
  precision?: number;

  @ApiProperty({
    description: 'List of elements linked by formula',
    type: [String],
    example: ['gain_factor', 'offset_value'],
    required: false,
  })
  linkedByForFormula?: string[];

  @ApiProperty({
    description: 'List of default data dependencies',
    type: [String],
    example: ['dependency1', 'dependency2'],
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
    example: 'ConfigElementArray',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'eq_bands',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Equalizer band settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    example: 0,
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    example: 0,
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    example: 4,
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    example: 'Line',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Audio Processing',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Equalizer',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    example: 'source_element',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Array length',
    example: 10,
    minimum: 0,
  })
  arrayLength!: number;

  @ApiProperty({
    description: 'Array length formula string',
    example: 'num_channels * 2',
  })
  arrayLenFormulaStr!: string;

  @ApiProperty({
    description: 'List of copy source information',
    type: [String],
    example: ['source1', 'source2'],
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
    example: 'Slider',
    required: false,
  })
  displayType?: DisplayTypeEnum;

  @ApiProperty({
    description: 'Element policy for visibility and access control',
    enum: Object.values(ElementPolicyEnum),
    example: 'Basic',
    required: false,
  })
  policy?: ElementPolicyEnum;

  @ApiProperty({
    description: 'Whether the element array is read-only',
    example: false,
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
    example: 'Struct',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'audio_settings',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Audio configuration settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    example: 0,
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    example: 0,
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    example: 4,
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    example: 'Line',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'System Config',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Audio Settings',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    example: 'source_element',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Structure type identifier',
    example: 'AudioConfig',
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
    example: 'StructArray',
    enum: Object.values(DefinitionElementTypeEnum),
  })
  elementType!: DefinitionElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'channel_configs',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Per-channel audio configuration settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Channel identifier',
    example: 0,
    required: false,
  })
  channel?: number;

  @ApiProperty({
    description: 'Group set identifier',
    example: 0,
    required: false,
  })
  groupSet?: number;

  @ApiProperty({
    description: 'Alignment value',
    example: 4,
    required: false,
  })
  alignment?: number;

  @ApiProperty({
    description: 'RTM plot type',
    example: 'Line',
    required: false,
  })
  rtmPlotType?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Channel Settings',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Multi-Channel',
    required: false,
  })
  subGroup?: string;

  @ApiProperty({
    description: 'Copy source reference',
    example: 'source_element',
    required: false,
  })
  copySrc?: string;

  @ApiProperty({
    description: 'Array length',
    example: 2,
    minimum: 0,
  })
  arrayLength!: number;

  @ApiProperty({
    description: 'Array length formula string',
    example: 'num_channels',
  })
  arrayLenFormulaStr!: string;

  @ApiProperty({
    description: 'List of copy source information',
    type: [String],
    example: ['source1', 'source2'],
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
