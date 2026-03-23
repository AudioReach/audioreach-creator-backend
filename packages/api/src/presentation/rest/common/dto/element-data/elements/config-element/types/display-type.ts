/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Arc display type values
 *
 * Defines how configuration elements should be rendered in the user interface.
 * Each display type corresponds to a specific UI control or input method.
 */
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
