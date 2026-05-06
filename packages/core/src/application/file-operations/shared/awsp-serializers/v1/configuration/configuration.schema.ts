/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  MODULE_PORT_STRATEGIES,
  PROCESSOR_DOMAINS,
  ALSA_FILE_TYPES,
} from './types.js';

/**
 * Schema for metadata information about the configuration file.
 */
export const MetadataSchema = z.object({
  lastModified: z.string(),
  generator: z.string(),
});

/**
 * Schema for buffer size configuration.
 */
export const BufferSizeSchema = z.object({
  pidSize: z.number(),
  rtcSize: z.number(),
  isEnabled: z.boolean(),
});

/**
 * Schema for processor configuration.
 */
export const ProcessorConfigSchema = z.object({
  name: z.string(),
  id: z.number(),
  bufferSize: BufferSizeSchema,
});

/**
 * Schema for RTC configuration.
 */
export const RtcConfigurationSchema = z.object({
  processors: z.array(ProcessorConfigSchema),
});

/**
 * Schema for ALSA group.
 */
export const AlsaGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  propertyIds: z.array(z.number()),
});

/**
 * Schema for ALSA library configuration.
 */
export const AlsaLibConfigurationSchema = z.object({
  includeTlvHeader: z.boolean(),
  fileType: z.enum([ALSA_FILE_TYPES.BIN, ALSA_FILE_TYPES.TEXT] as [
    string,
    ...string[],
  ]),
  groups: z.array(AlsaGroupSchema),
});

/**
 * Schema for configuration data.
 */
export const ConfigurationDataSchema = z.object({
  portStrategy: z.enum([
    MODULE_PORT_STRATEGIES.INPUT_ODD_OUTPUT_EVEN,
    MODULE_PORT_STRATEGIES.SEQUENTIAL,
  ] as [string, ...string[]]),
  defaultProcessorDomain: z.enum([
    PROCESSOR_DOMAINS.UNKNOWN,
    PROCESSOR_DOMAINS.ADSP,
    PROCESSOR_DOMAINS.MDSP,
    PROCESSOR_DOMAINS.CDSP,
    PROCESSOR_DOMAINS.SDSP,
  ] as [string, ...string[]]),
  rtcConfiguration: RtcConfigurationSchema,
  alsaLibConfiguration: AlsaLibConfigurationSchema,
});

/**
 * Root configuration schema.
 */
export const ConfigurationSchema = z.object({
  $version: z.number(), //TODO: remove $
  $metadata: MetadataSchema, //TODO: remove $
  configuration: ConfigurationDataSchema,
});

// Export inferred types
export type Metadata = z.infer<typeof MetadataSchema>;
export type BufferSize = z.infer<typeof BufferSizeSchema>;
export type ProcessorConfig = z.infer<typeof ProcessorConfigSchema>;
export type RtcConfiguration = z.infer<typeof RtcConfigurationSchema>;
export type AlsaGroup = z.infer<typeof AlsaGroupSchema>;
export type AlsaLibConfiguration = z.infer<typeof AlsaLibConfigurationSchema>;
export type ConfigurationData = z.infer<typeof ConfigurationDataSchema>;
export type Configuration = z.infer<typeof ConfigurationSchema>;
