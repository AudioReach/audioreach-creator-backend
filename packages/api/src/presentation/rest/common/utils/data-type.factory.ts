/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Discriminator const/type for supported data types.
 */
export const DATA_TYPE = {
  UInt8: 'UINT8',
  UInt16: 'UINT16',
  UInt32: 'UINT32',
  UInt64: 'UINT64',
  Int8: 'INT8',
  Int16: 'INT16',
  Int32: 'INT32',
  Int64: 'INT64',
  Float: 'FLOAT',
  Double: 'DOUBLE',
  String: 'STRING',
  Boolean: 'BOOLEAN',
} as const;

/**
 * Type representing supported data types.
 */
export type DataType = (typeof DATA_TYPE)[keyof typeof DATA_TYPE];

/**
 * Represents data type information including range and byte size.
 */
export class DataTypeDto {
  @ApiProperty({
    description: 'Data type name',
    enum: Object.values(DATA_TYPE),
  })
  typeName!: DataType;

  @ApiProperty({description: 'Size in bytes'})
  sizeInBytes!: number;

  @ApiProperty({
    description:
      'Minimum value for the data type. Not applicable for string type.',
    required: false,
  })
  minValue?: string;

  @ApiProperty({
    description:
      'Maximum value for the data type. Not applicable for string type.',
    required: false,
  })
  maxValue?: string;
}

const dataTypeDefinitions: Record<DataType, Omit<DataTypeDto, 'typeName'>> = {
  UINT8: {sizeInBytes: 1, minValue: '0', maxValue: '255'},
  UINT16: {sizeInBytes: 2, minValue: '0', maxValue: '65535'},
  UINT32: {sizeInBytes: 4, minValue: '0', maxValue: '4294967295'},
  UINT64: {sizeInBytes: 8, minValue: '0', maxValue: '18446744073709551615'},
  INT8: {sizeInBytes: 1, minValue: '-128', maxValue: '127'},
  INT16: {sizeInBytes: 2, minValue: '-32768', maxValue: '32767'},
  INT32: {sizeInBytes: 4, minValue: '-2147483648', maxValue: '2147483647'},
  INT64: {
    sizeInBytes: 8,
    minValue: '-9223372036854775808',
    maxValue: '9223372036854775807',
  },
  FLOAT: {
    sizeInBytes: 4,
    minValue: '-3.4028235e+38',
    maxValue: '3.4028235e+38',
  },
  DOUBLE: {
    sizeInBytes: 8,
    minValue: '-1.7976931348623157e+308',
    maxValue: '1.7976931348623157e+308',
  },
  STRING: {sizeInBytes: 0},
  BOOLEAN: {sizeInBytes: 1, minValue: 'false', maxValue: 'true'},
};

/**
 * Creates a DataTypeDto for the specified data type.
 * @param typeName - The data type name
 * @returns A DataTypeDto instance with predefined values
 */
export function createDataType(typeName: DataType): DataTypeDto {
  return {typeName, ...dataTypeDefinitions[typeName]};
}
