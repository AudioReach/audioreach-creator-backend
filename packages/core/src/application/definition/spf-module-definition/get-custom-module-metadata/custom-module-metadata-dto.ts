/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {CustomModuleMetadataReadModel} from '../../../ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';

const DataTypeSchema = z.object({
  typeName: z
    .enum([
      'UINT8',
      'UINT16',
      'UINT32',
      'UINT64',
      'INT8',
      'INT16',
      'INT32',
      'INT64',
      'FLOAT',
      'DOUBLE',
      'STRING',
      'BOOLEAN',
    ])
    .describe('Data type name'),
  sizeInBytes: z.number().int().describe('Size of the data type in bytes'),
  minValue: z
    .string()
    .optional()
    .describe('Minimum value (not applicable for STRING)'),
  maxValue: z
    .string()
    .optional()
    .describe('Maximum value (not applicable for STRING)'),
});

const NameValueSchema = z.object({
  name: z.string().describe('Display name'),
  value: z.string().describe('Encoded value'),
  valueDataType: DataTypeSchema.describe('Data type of the value field'),
});

const CustomModuleInterfaceSchema = z.object({
  type: NameValueSchema.describe('Interface type'),
  version: NameValueSchema.describe('Interface version'),
});

export const CustomModuleMetadataDtoSchema = z.object({
  type: NameValueSchema.describe('Module type'),
  interface: CustomModuleInterfaceSchema.describe('Selected interface'),
  fileName: z.string().describe('File name'),
  endPointFunctionTag: z.string().describe('Endpoint function tag'),
});

export type CustomModuleMetadataDto = z.infer<
  typeof CustomModuleMetadataDtoSchema
>;

// Fixed data types per LLD §2.3.3 — module type uses UINT32, interface type/version use UINT16
const DATA_TYPES = {
  UINT16: {
    typeName: 'UINT16',
    sizeInBytes: 2,
    minValue: '0',
    maxValue: '65535',
  },
  UINT32: {
    typeName: 'UINT32',
    sizeInBytes: 4,
    minValue: '0',
    maxValue: '4294967295',
  },
} as const;

function mapNameValue(
  nv: {name: string; value: string},
  dataType: (typeof DATA_TYPES)[keyof typeof DATA_TYPES],
): z.infer<typeof NameValueSchema> {
  return {name: nv.name, value: nv.value, valueDataType: dataType};
}

export function mapCustomModuleMetadata(
  m: CustomModuleMetadataReadModel,
): CustomModuleMetadataDto {
  return {
    type: mapNameValue(m.type, DATA_TYPES.UINT32),
    interface: {
      type: mapNameValue(m.interface.type, DATA_TYPES.UINT16),
      version: mapNameValue(m.interface.version, DATA_TYPES.UINT16),
    },
    fileName: m.fileName,
    endPointFunctionTag: m.endPointFunctionTag,
  };
}
