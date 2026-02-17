/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Represents any valid JSON value.
 * This type is used for unvalidated JSON data before transformation.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue};

/**
 * Represents a JSON object (not array, not primitive).
 * This type is used for raw JSON objects before validation and transformation.
 */
export type JsonObject = {[key: string]: JsonValue};
