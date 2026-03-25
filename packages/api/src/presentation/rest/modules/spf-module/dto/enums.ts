/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Enums for calibration and tag data DTOs
 *
 * This file contains all enum definitions used across calibration and tag data structures.
 * These enums provide type safety and serve as the single source of truth for valid values.
 */

/**
 * Arc data type values
 *
 * Defines the supported data types for configuration elements in the AudioReach framework.
 * These correspond to the underlying data representation and memory layout.
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
 *
 * Defines how configuration elements should be rendered in the user interface.
 * Each display type corresponds to a specific UI control or input method.
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
 * Arc element policy values
 *
 * Defines the visibility and access control policy for configuration elements.
 * Used to control which elements are shown to different user types or in different modes.
 */
export enum ElementPolicyEnum {
  Hidden = 'Hidden',
  Basic = 'Basic',
  Advanced = 'Advanced',
}

/**
 * Calibration element type values
 *
 * Defines the different types of calibration elements that can be used in the system.
 * Each type has different structural properties and use cases.
 */
export enum CalElementTypeEnum {
  ConfigElement = 'ConfigElement',
  ConfigElementArray = 'ConfigElementArray',
  Struct = 'Struct',
  StructArray = 'StructArray',
}
