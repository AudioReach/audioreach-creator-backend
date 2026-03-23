/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Discriminator const/type for calibration element structural kinds. */
export const ELEMENT_TYPE = {
  ConfigElement: 'CONFIG_ELEMENT',
  ElementTemplateArray: 'ELEMENT_TEMPLATE_ARRAY',
  Struct: 'STRUCT',
} as const;

export type ElementType = (typeof ELEMENT_TYPE)[keyof typeof ELEMENT_TYPE];
