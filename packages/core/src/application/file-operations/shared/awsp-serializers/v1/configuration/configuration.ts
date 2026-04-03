/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {
  IsIn,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  MODULE_PORT_STRATEGIES,
  PROCESSOR_DOMAINS,
  ALSA_FILE_TYPES,
  type ModulePortStrategy,
  type ProcessorDomain,
  type AlsaFileType,
} from './types.js';

/**
 * Represents metadata information about the configuration file.
 * Contains information about when the file was last modified and what tool generated it.
 */
export class Metadata {
  /**
   * ISO 8601 timestamp of when the configuration was last modified
   * @example "2026-02-03T04:06:17Z"
   */
  @Expose()
  @IsString()
  lastModified!: string;

  /**
   * Name and version of the tool that generated this configuration
   * @example "QwspConverter-1.0.0"
   */
  @Expose()
  @IsString()
  generator!: string;
}

/**
 * Represents buffer size configuration for a processor.
 * Defines memory allocation sizes for PID and RTC buffers.
 */
export class BufferSize {
  /**
   * Size of the PID (Process ID) buffer in bytes
   * @example 8192
   */
  @Expose()
  @IsNumber()
  pidSize!: number;

  /**
   * Size of the RTC (Real-Time Clock) buffer in bytes
   * @example 2097152
   */
  @Expose()
  @IsNumber()
  rtcSize!: number;

  /**
   * Whether the buffer configuration is enabled
   */
  @Expose()
  @IsBoolean()
  isEnabled!: boolean;
}

/**
 * Represents configuration for a single processor.
 * Contains processor identification and buffer settings.
 */
export class ProcessorConfig {
  /**
   * Name of the processor
   * @example "ADSP"
   */
  @Expose()
  @IsString()
  name!: string;

  /**
   * Unique identifier for the processor
   * @example 2
   */
  @Expose()
  @IsNumber()
  id!: number;

  /**
   * Buffer size configuration for this processor
   */
  @Expose()
  @Type(() => BufferSize)
  @ValidateNested()
  bufferSize!: BufferSize;
}

/**
 * Represents RTC (Real-Time Clock) configuration.
 * Contains settings for processor configurations in the RTC subsystem.
 */
export class RtcConfiguration {
  /**
   * Array of processor configurations
   */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => ProcessorConfig)
  processors!: ProcessorConfig[];
}

/**
 * Represents a group in ALSA lib configuration.
 * Groups are used to organize properties for ALSA library integration.
 */
export class AlsaGroup {
  /**
   * Unique identifier for the group
   * @example 1
   */
  @Expose()
  @IsNumber()
  id!: number;

  /**
   * Human-readable name for the group
   * @example "Group 1"
   */
  @Expose()
  @IsString()
  name!: string;

  /**
   * Array of property IDs that belong to this group
   * @example [1, 4]
   */
  @Expose()
  @IsArray()
  @IsNumber({}, {each: true})
  propertyIds!: number[];
}

/**
 * Represents ALSA (Advanced Linux Sound Architecture) library configuration.
 * Contains settings for ALSA integration including file format and property groups.
 */
export class AlsaLibConfiguration {
  /**
   * Whether to include TLV (Type-Length-Value) header in the output
   */
  @Expose()
  @IsBoolean()
  includeTlvHeader!: boolean;

  /**
   * File type for ALSA configuration output
   */
  @Expose()
  @IsIn(Object.values(ALSA_FILE_TYPES))
  fileType!: AlsaFileType;

  /**
   * Array of property groups for ALSA configuration
   */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AlsaGroup)
  groups!: AlsaGroup[];
}

/**
 * Represents the main configuration data from configuration.json.
 * Contains all system-wide settings including port strategy, processor domain,
 * RTC configuration, and ALSA library settings.
 */
export class ConfigurationData {
  /**
   * Strategy for assigning port IDs to module ports (required)
   */
  @Expose()
  @IsIn(Object.values(MODULE_PORT_STRATEGIES))
  portStrategy!: ModulePortStrategy;

  /**
   * Default processor domain for the system
   */
  @Expose()
  @IsIn(Object.values(PROCESSOR_DOMAINS))
  defaultProcessorDomain!: ProcessorDomain;

  /**
   * RTC (Real-Time Clock) configuration settings
   */
  @Expose()
  @Type(() => RtcConfiguration)
  @ValidateNested()
  rtcConfiguration!: RtcConfiguration;

  /**
   * ALSA library configuration settings
   */
  @Expose()
  @Type(() => AlsaLibConfiguration)
  @ValidateNested()
  alsaLibConfiguration!: AlsaLibConfiguration;
}

/**
 * Root configuration class representing the entire configuration.json file structure.
 * This is the top-level class that wraps version, metadata, and configuration data.
 */
export class Configuration {
  /**
   * Version number of the configuration file format
   * @example 1
   */
  @Expose({name: '$version'})
  @IsNumber()
  version!: number;

  /**
   * Metadata about the configuration file
   */
  @Expose({name: '$metadata'})
  @Type(() => Metadata)
  @ValidateNested()
  metadata!: Metadata;

  /**
   * The actual configuration data
   */
  @Expose()
  @Type(() => ConfigurationData)
  @ValidateNested()
  configuration!: ConfigurationData;
}
