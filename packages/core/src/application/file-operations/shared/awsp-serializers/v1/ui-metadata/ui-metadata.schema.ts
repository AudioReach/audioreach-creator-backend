/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {z} from 'zod';
import {HexIdSchema} from '../definitions/common/hex-id.schema.js';

export const UiPayloadMapEntrySchema = z.object({
  id: z.string(),
  data: z.string(),
});

export const UiUsecaseSchema = z.object({
  type: z.string(),
  keyValue: z.string(),
  aliasId: z.string().optional(),
  aliasName: z.string().optional(),
});

export const UiSubsystemChildSchema = z.object({
  id: HexIdSchema,
  type: z.enum(['Subgraph', 'Subsystem']),
});

export const UiSubsystemSchema = z.object({
  id: HexIdSchema,
  name: z.string(),
  filteredGraphKeys: z.string().optional(),
  children: z.array(UiSubsystemChildSchema).optional().default([]),
});

export const UiSubgraphSchema = z.object({
  id: HexIdSchema,
  name: z.string().optional(),
  supportedKeyValues: z
    .array(z.object({keyValue: z.string()}))
    .optional()
    .default([]),
});

export const UiCalViewUiPersistenceSchema = z.object({
  payloadId: z.string(),
  calKeyValue: z.string().optional(),
});

export const UiModuleSchema = z.object({
  definitionId: HexIdSchema,
  instanceId: HexIdSchema,
  calViewUiPersistences: z
    .array(UiCalViewUiPersistenceSchema)
    .optional()
    .default([]),
});

export const UiDataLinkSchema = z.object({
  isEcLink: z.boolean(),
  sourceId: HexIdSchema,
  sourcePortId: HexIdSchema,
  destinationId: HexIdSchema,
  destinationPortId: HexIdSchema,
});

export const UiMetadataSchema = z.object({
  version: z.object({major: z.number(), minor: z.number()}),
  payloadMap: z.array(UiPayloadMapEntrySchema).optional().default([]),
  usecases: z.array(UiUsecaseSchema).optional().default([]),
  subsystems: z.array(UiSubsystemSchema).optional().default([]),
  subgraphs: z.array(UiSubgraphSchema).optional().default([]),
  modules: z.array(UiModuleSchema).optional().default([]),
  dataLinks: z.array(UiDataLinkSchema).optional().default([]),
});

export type UiPayloadMapEntryData = z.infer<typeof UiPayloadMapEntrySchema>;
export type UiUsecaseData = z.infer<typeof UiUsecaseSchema>;
export type UiSubsystemChildData = z.infer<typeof UiSubsystemChildSchema>;
export type UiSubsystemData = z.infer<typeof UiSubsystemSchema>;
export type UiSubgraphData = z.infer<typeof UiSubgraphSchema>;
export type UiCalViewUiPersistenceData = z.infer<
  typeof UiCalViewUiPersistenceSchema
>;
export type UiModuleData = z.infer<typeof UiModuleSchema>;
export type UiDataLinkData = z.infer<typeof UiDataLinkSchema>;
export type UiMetadataData = z.infer<typeof UiMetadataSchema>;

export function parseKeyValueString(
  kv: string,
): {keyId: number; valueId: number}[] {
  if (!kv || !kv.trim()) return [];
  // eslint-disable-next-line sonarjs/slow-regex
  const bracketRegex = /\[([^\]]*)\]/g;
  const results: {keyId: number; valueId: number}[] = [];
  let match: RegExpExecArray | null;
  while ((match = bracketRegex.exec(kv)) !== null) {
    const parts = match[1].split(':').map(s => s.trim());
    if (parts.length !== 2) continue;
    const keyId = Number.parseInt(parts[0], 16);
    const valueId = Number.parseInt(parts[1], 16);
    if (!Number.isNaN(keyId) && !Number.isNaN(valueId)) {
      results.push({keyId, valueId});
    }
  }
  return results;
}
