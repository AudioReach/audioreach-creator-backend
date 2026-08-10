/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
} from '../../../ports/persistence/query-services/key-value/key-value-definition-read-model.js';

export const ValueDefinitionDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the value'),
  valueId: z.number().int().describe('Value identifier'),
  name: z.string().describe('Value name'),
  description: z.string().optional().describe('Value description'),
  enumMember: z.string().describe('Value enum member for pseudo header file'),
  specialValue: z
    .string()
    .optional()
    .describe('Special value (present if specialKey is SampleRate or Volume)'),
});

export const KeyDefinitionDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier for the key'),
  keyId: z.number().int().describe('Key identifier'),
  name: z.string().describe('Key name'),
  description: z.string().optional().describe('Key description'),
  enumMember: z.string().describe('Key enum member for pseudo header file'),
  enumName: z.string().describe('Key enum name for pseudo header file'),
  isVoice: z.boolean().describe('Indicates if the key is a voice key'),
  isDynamic: z.boolean().describe('Indicates if the key is dynamic'),
  isCalibrationKey: z
    .boolean()
    .describe('Indicates if the key is a calibration key'),
  isGraphKey: z.boolean().describe('Indicates if the key is a graph key'),
  specialKey: z
    .enum(['SAMPLE_RATE', 'VOLUME'])
    .optional()
    .describe('Special key type'),
  calKeyEnumMember: z
    .string()
    .optional()
    .describe('Calibration key enum member (when isCalibrationKey is true)'),
  graphKeyEnumMember: z
    .string()
    .optional()
    .describe('Graph key enum member (when isGraphKey is true)'),
  values: z
    .array(ValueDefinitionDtoSchema)
    .describe('Value definitions for this key'),
});

export type KeyDefinitionDto = z.infer<typeof KeyDefinitionDtoSchema>;
export type ValueDefinitionDto = z.infer<typeof ValueDefinitionDtoSchema>;

export function mapValueDefinition(
  v: ValueDefinitionReadModel,
): ValueDefinitionDto {
  return {
    systemId: String(v.systemId),
    valueId: v.valueId,
    name: v.name,
    description: v.description,
    enumMember: v.enumMember ?? '',
    specialValue: v.specialValue,
  };
}

export function mapKeyDefinition(k: KeyDefinitionReadModel): KeyDefinitionDto {
  return {
    systemId: String(k.systemId),
    keyId: k.keyId,
    name: k.name,
    description: k.description,
    enumMember: k.cHeaderAttributes?.enumMember ?? '',
    enumName: k.cHeaderAttributes?.enumName ?? '',
    isVoice: k.isVoice ?? false,
    isDynamic: k.isDynamic ?? false,
    isCalibrationKey: k.isCalibrationKey ?? false,
    isGraphKey: k.isGraphKey ?? false,
    specialKey: k.specialityKeyValue as KeyDefinitionDto['specialKey'],
    calKeyEnumMember: k.cHeaderAttributes?.calKeyEnumMember,
    graphKeyEnumMember: k.cHeaderAttributes?.graphKeyEnumMember,
    values: k.values.map(v => mapValueDefinition(v)),
  };
}
