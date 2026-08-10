/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const ELEMENT_TYPE = {
  ConfigElement: 'CONFIG_ELEMENT',
  ElementTemplateArray: 'ELEMENT_TEMPLATE_ARRAY',
  Struct: 'STRUCT',
} as const;

export type ElementType = (typeof ELEMENT_TYPE)[keyof typeof ELEMENT_TYPE];

export const DATA_TYPE = {
  UInt8: 'UInt8',
  UInt16: 'UInt16',
  UInt32: 'UInt32',
  UInt64: 'UInt64',
  Int8: 'Int8',
  Int16: 'Int16',
  Int32: 'Int32',
  Int64: 'Int64',
  RawData: 'RawData',
  Double: 'Double',
  Float: 'Float',
} as const;

export type DataType = (typeof DATA_TYPE)[keyof typeof DATA_TYPE];

export const DISPLAY_TYPE = {
  TextBox: 'TEXT_BOX',
  DbTextBox: 'DB_TEXT_BOX',
  QFormattedValue: 'Q_FORMATTED_VALUE',
  Slider: 'SLIDER',
  CheckBox: 'CHECK_BOX',
  DropDown: 'DROP_DOWN',
  Dump: 'DUMP',
  File: 'FILE',
  BitField: 'BIT_FIELD',
  Formula: 'FORMULA',
  StringField: 'STRING_FIELD',
} as const;

export type DisplayType = (typeof DISPLAY_TYPE)[keyof typeof DISPLAY_TYPE];

export const ELEMENT_POLICY = {
  Hidden: 'HIDDEN',
  Basic: 'BASIC',
  Advanced: 'ADVANCED',
} as const;

export type ElementPolicy =
  (typeof ELEMENT_POLICY)[keyof typeof ELEMENT_POLICY];

export const ALLOWED_VALUES_ITEM_TYPE = {
  NameValuePair: 'NAME_VALUE_PAIR',
  BitField: 'BIT_FIELD',
} as const;

export type AllowedValuesItemType =
  (typeof ALLOWED_VALUES_ITEM_TYPE)[keyof typeof ALLOWED_VALUES_ITEM_TYPE];
