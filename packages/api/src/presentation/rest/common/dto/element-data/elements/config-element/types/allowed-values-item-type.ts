/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Discriminator const/type for items that can appear in allowedValues arrays.
 * These types represent different kinds of value options that can be presented
 * to users for configuration elements.
 */
export const ALLOWED_VALUES_ITEM_TYPE = {
  /** Simple name-value pair option (e.g., "False"=0, "True"=1) */
  NameValuePair: 'NAME_VALUE_PAIR',
  /** Bit field with its own set of allowed values */
  BitField: 'BIT_FIELD',
} as const;

export type AllowedValuesItemType =
  (typeof ALLOWED_VALUES_ITEM_TYPE)[keyof typeof ALLOWED_VALUES_ITEM_TYPE];
