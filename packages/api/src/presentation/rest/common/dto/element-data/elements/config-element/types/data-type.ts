/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Supported binary data types for a configuration element value.
 */
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
