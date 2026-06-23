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

// Parses wire format; field-level coercions only, no structural transform
export const ConfigurationSchema = z.object({
  portStrategy: PortStrategySchema,
  defaultProcessorDomain: ProcessorDomainIdSchema,
  rtc: RtcConfigSchema,
  alsaLib: AlsaLibConfigSchema,
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
});

// Export inferred types
export type ProcessorConfig = z.infer<typeof ProcessorConfigSchema>;
export type RtcConfig = z.infer<typeof RtcConfigSchema>;
export type AlsaGroup = z.infer<typeof AlsaGroupSchema>;
export type AlsaLibConfig = z.infer<typeof AlsaLibConfigSchema>;
export type ConfigurationData = z.infer<typeof ConfigurationDataSchema>;
