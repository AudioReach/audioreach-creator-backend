/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {MODULE_PORT_STRATEGIES, ALSA_FILE_TYPES} from './types.js';
import {HexIdSchema} from '../definitions/common/hex-id.schema.js';

// Field-level coercion schemas for wire-format wrapper objects
const PortStrategySchema = z
  .object({
    strategy: z.enum([
      MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
      MODULE_PORT_STRATEGIES.SEQUENTIAL,
    ] as [string, ...string[]]),
  })
  .transform(o => o.strategy);

const ProcessorDomainIdSchema = z
  .object({id: HexIdSchema})
  .transform(o => o.id);

// ─── Schemas (property names match wire format) ───────────────────────────────

export const ProcessorConfigSchema = z.object({
  name: z.string(),
  id: HexIdSchema,
  pidSize: z.number(),
  rtcSize: z.number(),
  isEnabled: z.boolean(),
});

export const RtcConfigSchema = z.object({
  processors: z.array(ProcessorConfigSchema),
});

export const AlsaGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  properties: z.array(z.object({id: z.number()})),
});

export const AlsaLibConfigSchema = z.object({
  includeTlvHeader: z.boolean(),
  fileType: z.preprocess(
    val => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum([ALSA_FILE_TYPES.BIN, ALSA_FILE_TYPES.TEXT] as [
      string,
      ...string[],
    ]),
  ),
  groups: z.array(AlsaGroupSchema),
});

// ─── Validation schemas ───────────────────────────────────────────────────────

export const ValidationDiagnosticEntrySchema = z.object({
  code: z.string(),
  severity: z.string(),
  ignore: z.boolean(),
});

export const ValidationConfigSchema = z.object({
  diagnosticOverrides: z
    .array(ValidationDiagnosticEntrySchema)
    .optional()
    .default([]),
});

// ─── AlsaMetaData schemas ─────────────────────────────────────────────────────

export const AlsaFileGroupSchema = z.object({
  id: HexIdSchema,
  name: z.string(),
});

export const AlsaFileInfoSchema = z.object({
  directoryPath: z.string().optional(),
  groups: z.array(AlsaFileGroupSchema).optional().default([]),
});

export const AlsaSubgraphMetaDataSchema = z.object({
  subgraphId: HexIdSchema,
  selectedCkv: z.string().optional(),
});

export const AlsaMetaDataSchema = z.object({
  usecase: z.string(),
  alsaFileInfo: AlsaFileInfoSchema.optional(),
  subgraphs: z.array(AlsaSubgraphMetaDataSchema).optional().default([]),
});

// ─── AlsaTagData schemas ──────────────────────────────────────────────────────

export const AlsaTagKeyValueSchema = z.object({
  groupId: HexIdSchema,
  selectedTkv: z.string().optional(),
});

export const AlsaSubgraphTagDataSchema = z.object({
  subgraphId: HexIdSchema,
  selectedTkvList: z.array(AlsaTagKeyValueSchema).optional().default([]),
});

export const AlsaTagDataSchema = z.object({
  usecase: z.string(),
  alsaFileInfo: AlsaFileInfoSchema.optional(),
  subgraphs: z.array(AlsaSubgraphTagDataSchema).optional().default([]),
});

// ─── Root configuration schemas ───────────────────────────────────────────────

// Parses wire format; field-level coercions only, no structural transform
export const ConfigurationSchema = z.object({
  portStrategy: PortStrategySchema,
  defaultProcessorDomain: ProcessorDomainIdSchema,
  rtc: RtcConfigSchema,
  alsaLib: AlsaLibConfigSchema,
  validation: ValidationConfigSchema.optional(),
  alsaMetaData: z.array(AlsaMetaDataSchema).optional(),
  alsaTagData: z.array(AlsaTagDataSchema).optional(),
});

// Validates the normalized shape (output of ConfigurationSchema or class roundtrips)
export const ConfigurationDataSchema = z.object({
  portStrategy: z.enum([
    MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
    MODULE_PORT_STRATEGIES.SEQUENTIAL,
  ] as [string, ...string[]]),
  defaultProcessorDomain: z.number().int().nonnegative(),
  rtc: RtcConfigSchema,
  alsaLib: AlsaLibConfigSchema,
  validation: ValidationConfigSchema.optional(),
  alsaMetaData: z.array(AlsaMetaDataSchema).optional(),
  alsaTagData: z.array(AlsaTagDataSchema).optional(),
});

// Export inferred types
export type ProcessorConfig = z.infer<typeof ProcessorConfigSchema>;
export type RtcConfig = z.infer<typeof RtcConfigSchema>;
export type AlsaGroup = z.infer<typeof AlsaGroupSchema>;
export type AlsaLibConfig = z.infer<typeof AlsaLibConfigSchema>;
export type ValidationDiagnosticEntry = z.infer<
  typeof ValidationDiagnosticEntrySchema
>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type AlsaFileGroup = z.infer<typeof AlsaFileGroupSchema>;
export type AlsaFileInfo = z.infer<typeof AlsaFileInfoSchema>;
export type AlsaSubgraphMetaData = z.infer<typeof AlsaSubgraphMetaDataSchema>;
export type AlsaMetaData = z.infer<typeof AlsaMetaDataSchema>;
export type AlsaTagKeyValue = z.infer<typeof AlsaTagKeyValueSchema>;
export type AlsaSubgraphTagData = z.infer<typeof AlsaSubgraphTagDataSchema>;
export type AlsaTagData = z.infer<typeof AlsaTagDataSchema>;
export type ConfigurationData = z.infer<typeof ConfigurationDataSchema>;
