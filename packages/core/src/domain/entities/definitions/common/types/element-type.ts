/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Display widget type for a parameter element (DB layer). */
export const DISPLAY_TYPE = {
  TEXTBOX: 'TEXTBOX',
  DB_TEXTBOX: 'DB_TEXTBOX',
  QFORMATTED_VALUE: 'QFORMATTED_VALUE',
  SLIDER: 'SLIDER',
  CHECKBOX: 'CHECKBOX',
  DROPDOWN: 'DROPDOWN',
  DUMP: 'DUMP',
  FILE: 'FILE',
  BITFIELD: 'BITFIELD',
  FORMULA: 'FORMULA',
  STRINGFIELD: 'STRINGFIELD',
} as const;

export type DisplayType = (typeof DISPLAY_TYPE)[keyof typeof DISPLAY_TYPE];

/** Discriminator values for the `elementType` field in the parameter structure JSON schema (DB layer). */
export const PARAMETER_ELEMENT_TYPE = {
  ConfigElement: 'ConfigElement',
  Struct: 'Struct',
  ElementArray: 'ElementArray',
  StructArray: 'StructArray',
} as const;

export type ParameterElementType =
  (typeof PARAMETER_ELEMENT_TYPE)[keyof typeof PARAMETER_ELEMENT_TYPE];
