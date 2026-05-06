/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type ModulePortStrategy,
  type ProcessorDomain,
  type AlsaFileType,
} from './types.js';
import {
  MetadataSchema,
  BufferSizeSchema,
  ProcessorConfigSchema,
  RtcConfigurationSchema,
  AlsaGroupSchema,
  AlsaLibConfigurationSchema,
  ConfigurationDataSchema,
  ConfigurationSchema,
} from './configuration.schema.js';
import {BaseDefinition} from '../definitions/common/base-definition.js';

/**
 * Represents metadata information about the configuration file.
 * Contains information about when the file was last modified and what tool generated it.
 */
export class Metadata extends BaseDefinition {
  /**
   * ISO 8601 timestamp of when the configuration was last modified
   * @example "2026-02-03T04:06:17Z"
   */
  lastModified!: string;

  /**
   * Name and version of the tool that generated this configuration
   * @example "QwspConverter-1.0.0"
   */
  generator!: string;

  static fromJSON(data: unknown): Metadata {
    const validated = MetadataSchema.parse(data);
    return Object.assign(new Metadata(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {
      lastModified: this.lastModified,
      generator: this.generator,
    };
  }
}

/**
 * Represents buffer size configuration for a processor.
 * Defines memory allocation sizes for PID and RTC buffers.
 */
export class BufferSize extends BaseDefinition {
  /**
   * Size of the PID (Process ID) buffer in bytes
   * @example 8192
   */
  pidSize!: number;

  /**
   * Size of the RTC (Real-Time Clock) buffer in bytes
   * @example 2097152
   */
  rtcSize!: number;

  /**
   * Whether the buffer configuration is enabled
   */
  isEnabled!: boolean;

  static fromJSON(data: unknown): BufferSize {
    const validated = BufferSizeSchema.parse(data);
    return Object.assign(new BufferSize(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {
      pidSize: this.pidSize,
      rtcSize: this.rtcSize,
      isEnabled: this.isEnabled,
    };
  }
}

/**
 * Represents configuration for a single processor.
 * Contains processor identification and buffer settings.
 */
export class ProcessorConfig extends BaseDefinition {
  /**
   * Name of the processor
   * @example "ADSP"
   */
  name!: string;

  /**
   * Unique identifier for the processor
   * @example 2
   */
  id!: number;

  /**
   * Buffer size configuration for this processor
   */
  bufferSize!: BufferSize;

  static fromJSON(data: unknown): ProcessorConfig {
    const validated = ProcessorConfigSchema.parse(data);
    return this.hydrateInstance(new ProcessorConfig(), validated, [
      {field: 'bufferSize', hydrator: BufferSize},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      id: this.id,
      bufferSize: this.serializeField(this.bufferSize),
    };
  }
}

/**
 * Represents RTC (Real-Time Clock) configuration.
 * Contains settings for processor configurations in the RTC subsystem.
 */
export class RtcConfiguration extends BaseDefinition {
  /**
   * Array of processor configurations
   */
  processors!: ProcessorConfig[];

  static fromJSON(data: unknown): RtcConfiguration {
    const validated = RtcConfigurationSchema.parse(data);
    return this.hydrateInstance(new RtcConfiguration(), validated, [
      {field: 'processors', hydrator: ProcessorConfig, isArray: true},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      processors: this.serializeField(this.processors),
    };
  }
}

/**
 * Represents a group in ALSA lib configuration.
 * Groups are used to organize properties for ALSA library integration.
 */
export class AlsaGroup extends BaseDefinition {
  /**
   * Unique identifier for the group
   * @example 1
   */
  id!: number;

  /**
   * Human-readable name for the group
   * @example "Group 1"
   */
  name!: string;

  /**
   * Array of property IDs that belong to this group
   * @example [1, 4]
   */
  propertyIds!: number[];

  static fromJSON(data: unknown): AlsaGroup {
    const validated = AlsaGroupSchema.parse(data);
    return Object.assign(new AlsaGroup(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      propertyIds: this.propertyIds,
    };
  }
}

/**
 * Represents ALSA (Advanced Linux Sound Architecture) library configuration.
 * Contains settings for ALSA integration including file format and property groups.
 */
export class AlsaLibConfiguration extends BaseDefinition {
  /**
   * Whether to include TLV (Type-Length-Value) header in the output
   */
  includeTlvHeader!: boolean;

  /**
   * File type for ALSA configuration output
   */
  fileType!: AlsaFileType;

  /**
   * Array of property groups for ALSA configuration
   */
  groups!: AlsaGroup[];

  static fromJSON(data: unknown): AlsaLibConfiguration {
    const validated = AlsaLibConfigurationSchema.parse(data);
    return this.hydrateInstance(new AlsaLibConfiguration(), validated, [
      {field: 'groups', hydrator: AlsaGroup, isArray: true},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      includeTlvHeader: this.includeTlvHeader,
      fileType: this.fileType,
      groups: this.serializeField(this.groups),
    };
  }
}

/**
 * Represents the main configuration data from configuration.json.
 * Contains all system-wide settings including port strategy, processor domain,
 * RTC configuration, and ALSA library settings.
 */
export class ConfigurationData extends BaseDefinition {
  /**
   * Strategy for assigning port IDs to module ports (required)
   */
  portStrategy!: ModulePortStrategy;

  /**
   * Default processor domain for the system
   */
  defaultProcessorDomain!: ProcessorDomain;

  /**
   * RTC (Real-Time Clock) configuration settings
   */
  rtcConfiguration!: RtcConfiguration;

  /**
   * ALSA library configuration settings
   */
  alsaLibConfiguration!: AlsaLibConfiguration;

  static fromJSON(data: unknown): ConfigurationData {
    const validated = ConfigurationDataSchema.parse(data);
    return this.hydrateInstance(new ConfigurationData(), validated, [
      {field: 'rtcConfiguration', hydrator: RtcConfiguration},
      {field: 'alsaLibConfiguration', hydrator: AlsaLibConfiguration},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      portStrategy: this.portStrategy,
      defaultProcessorDomain: this.defaultProcessorDomain,
      rtcConfiguration: this.serializeField(this.rtcConfiguration),
      alsaLibConfiguration: this.serializeField(this.alsaLibConfiguration),
    };
  }
}

/**
 * Root configuration class representing the entire configuration.json file structure.
 * This is the top-level class that wraps version, metadata, and configuration data.
 */
export class Configuration extends BaseDefinition {
  /**
   * Version number of the configuration file format
   * @example 1
   */
  version!: number;

  /**
   * Metadata about the configuration file
   */
  metadata!: Metadata;

  /**
   * The actual configuration data
   */
  configuration!: ConfigurationData;

  static fromJSON(data: unknown): Configuration {
    const validated = ConfigurationSchema.parse(data);
    const instance = new Configuration();

    // Map $version and $metadata to version and metadata
    instance.version = validated.$version;
    instance.metadata = Metadata.fromJSON(validated.$metadata);
    instance.configuration = ConfigurationData.fromJSON(
      validated.configuration,
    );

    return instance;
  }

  toJSON(): Record<string, unknown> {
    return {
      $version: this.version,
      $metadata: this.serializeField(this.metadata),
      configuration: this.serializeField(this.configuration),
    };
  }
}
