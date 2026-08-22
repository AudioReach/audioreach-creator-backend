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

export const UiOrderedKeySchema = z.object({
  id: HexIdSchema,
});

export const UiUsecaseSchema = z.object({
  keyValue: z.string(),
  aliasId: z.string().optional(),
  aliasName: z.string().optional(),
  categoryName: z.string().optional(),
  isEc: z.boolean().optional(),
  skipRouting: z.boolean().optional(),
  orderedKeys: z.array(UiOrderedKeySchema).optional().default([]),
  reviewedAt: z.string().optional(),
});

export const UiSubsystemChildSchema = z.object({
  id: HexIdSchema,
  type: z.enum(['Subgraph', 'Subsystem', 'Unknown']),
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
  reviewedAt: z.string().optional(),
});

export const UiCalViewUiPersistenceSchema = z.object({
  payloadId: z.string(),
  calKeyValue: z.string().optional(),
});

export const UiModuleSchema = z.object({
  definitionId: HexIdSchema,
  instanceId: HexIdSchema,
  aliasName: z.string().optional(),
  calViewUiPersistences: z
    .array(UiCalViewUiPersistenceSchema)
    .optional()
    .default([]),
  reviewedAt: z.string().optional(),
});

export const UiDataLinkSchema = z.object({
  isEcLink: z.boolean(),
  sourceId: HexIdSchema,
  sourcePortId: HexIdSchema,
  destinationId: HexIdSchema,
  destinationPortId: HexIdSchema,
});

// ===== Switch Persistence Schemas =====

export const SwitchPortKeyValueSchema = z.object({
  name: z.string(),
});

export const SwitchPortSchema = z.object({
  id: HexIdSchema,
  keyValues: z.array(SwitchPortKeyValueSchema).optional().default([]),
});

export const SwitchDataPortsInfoSchema = z.object({
  maxPortCount: z.number(),
  ports: z.array(SwitchPortSchema).optional().default([]),
});

export const SwitchControlPortsInfoSchema = z.object({
  maxPortCount: z.number(),
});

export const SwitchConnectionSchema = z.object({
  sourceId: HexIdSchema,
  sourcePortId: HexIdSchema,
  sourceType: z.string(),
  destinationId: HexIdSchema,
  destinationPortId: HexIdSchema,
  destinationType: z.string(),
  category: z.string(),
});

export const SwitchDataLinkSchema = z.object({
  sourceId: HexIdSchema,
  sourcePortId: HexIdSchema,
  destinationId: HexIdSchema,
  destinationPortId: HexIdSchema,
  metaLinks: z.array(SwitchConnectionSchema).optional().default([]),
});

export const SwitchControlLinkSchema = z.object({
  sourceId: HexIdSchema,
  sourcePortId: HexIdSchema,
  destinationId: HexIdSchema,
  destinationPortId: HexIdSchema,
  metaLinks: z.array(SwitchConnectionSchema).optional().default([]),
});

export const SwitchModuleInfoSchema = z.object({
  instanceId: HexIdSchema,
});

export const SwitchPersistenceSchema = z.object({
  id: HexIdSchema,
  parentSubgraphId: HexIdSchema.optional(),
  parentSubsystemId: HexIdSchema.optional(),
  type: z.string(),
  inputPort: SwitchDataPortsInfoSchema.optional(),
  outputPort: SwitchDataPortsInfoSchema.optional(),
  controlPort: SwitchControlPortsInfoSchema.optional(),
  dataLinks: z.array(SwitchDataLinkSchema).optional().default([]),
  controlLinks: z.array(SwitchControlLinkSchema).optional().default([]),
  modules: z.array(SwitchModuleInfoSchema).optional().default([]),
});

// ===== SRS Metadata Schemas =====

export const SrsConfigurationPersistenceSchema = z.object({
  isEnabled: z.boolean().optional(),
  timeLimit: z.number().optional(),
  sourceType: z.string().optional(),
  sourcePath: z.string().optional(),
  shellPath: z.string().optional(),
  arguments: z.string().optional(),
  outputFilePath: z.string().optional(),
  promptForArguments: z.boolean().optional(),
  runOnlyOncePerSession: z.boolean().optional(),
});

export const SrsScriptPersistenceSchema = z.object({
  name: z.string(),
  configuration: SrsConfigurationPersistenceSchema.optional(),
  description: z.string().optional(),
  scriptContent: z.string().optional(),
});

export const SrsActionPersistenceSchema = z.object({
  name: z.string(),
  scripts: z.array(SrsScriptPersistenceSchema).optional().default([]),
});

export const SrsMetadataPersistenceSchema = z.object({
  SrsCategories: z.array(SrsActionPersistenceSchema).optional().default([]),
});

// ===== Root UiMetadata Schema =====

export const UiMetadataSchema = z.object({
  version: z.object({major: z.number(), minor: z.number()}),
  payloadMap: z.array(UiPayloadMapEntrySchema).optional().default([]),
  usecases: z.array(UiUsecaseSchema).optional().default([]),
  subsystems: z.array(UiSubsystemSchema).optional().default([]),
  subgraphs: z.array(UiSubgraphSchema).optional().default([]),
  modules: z.array(UiModuleSchema).optional().default([]),
  dataLinks: z.array(UiDataLinkSchema).optional().default([]),
  switches: z.array(SwitchPersistenceSchema).optional().default([]),
  srsMetadata: SrsMetadataPersistenceSchema.optional(),
});

export type UiPayloadMapEntryData = z.infer<typeof UiPayloadMapEntrySchema>;
export type UiOrderedKeyData = z.infer<typeof UiOrderedKeySchema>;
export type UiUsecaseData = z.infer<typeof UiUsecaseSchema>;
export type UiSubsystemChildData = z.infer<typeof UiSubsystemChildSchema>;
export type UiSubsystemData = z.infer<typeof UiSubsystemSchema>;
export type UiSubgraphData = z.infer<typeof UiSubgraphSchema>;
export type UiCalViewUiPersistenceData = z.infer<
  typeof UiCalViewUiPersistenceSchema
>;
export type UiModuleData = z.infer<typeof UiModuleSchema>;
export type UiDataLinkData = z.infer<typeof UiDataLinkSchema>;
export type SwitchPersistenceData = z.infer<typeof SwitchPersistenceSchema>;
export type SrsMetadataPersistenceData = z.infer<
  typeof SrsMetadataPersistenceSchema
>;
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
