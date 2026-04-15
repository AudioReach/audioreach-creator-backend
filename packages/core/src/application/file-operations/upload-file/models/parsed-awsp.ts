/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  AwspKeyDefinition,
  TagDefinition,
  SpfPropertyDefinition,
  DriverPropertyDefinition,
  SpfModuleDefinition,
  DriverModuleDefinition,
  ProcessorDefinition,
  ContainerType,
} from '../../shared/awsp-serializers/v1/definitions/index.js';
import type {ConfigurationData} from '../../shared/awsp-serializers/v1/configuration/index.js';
import {DEFINITION_BLOCK_NAMES} from '../../shared/constants/definition-block-names.js';

/**
 * Union type of all possible definition arrays that can be stored in ParsedAwsp
 */
export type DefinitionCollection =
  | AwspKeyDefinition[]
  | TagDefinition[]
  | SpfPropertyDefinition[]
  | DriverPropertyDefinition[]
  | SpfModuleDefinition[]
  | DriverModuleDefinition[]
  | ProcessorDefinition[]
  | ContainerType[];

/**
 * Type for definition block names to ensure consistency
 */
export type DefinitionBlockName =
  (typeof DEFINITION_BLOCK_NAMES)[keyof typeof DEFINITION_BLOCK_NAMES];

/**
 * Container for all parsed definitions from an AWSP file
 * Provides type-safe access to different definition collections
 */
export class ParsedAwsp {
  private definitions = new Map<DefinitionBlockName, DefinitionCollection>();
  private configuration!: ConfigurationData;

  /**
   * Add a collection of parsed definitions to the container
   */
  addDefinitions(
    definitionType: DefinitionBlockName,
    definitions: DefinitionCollection,
  ): void {
    if (definitions && Array.isArray(definitions) && definitions.length > 0) {
      this.definitions.set(definitionType, definitions);
    }
  }

  /**
   * Set the configuration from configuration.json
   */
  setConfiguration(configuration: ConfigurationData): void {
    this.configuration = configuration;
  }

  /**
   * Get the configuration
   */
  getConfiguration(): ConfigurationData {
    return this.configuration;
  }

  /**
   * Retrieve a specific definition collection by type
   */
  getDefinitions<T extends DefinitionCollection>(
    definitionType: DefinitionBlockName,
  ): T | undefined {
    return this.definitions.get(definitionType) as T | undefined;
  }

  /**
   * Check if a definition type exists in the parsed data
   */
  hasDefinitions(definitionType: DefinitionBlockName): boolean {
    return this.definitions.has(definitionType);
  }

  /**
   * Get all parsed definition collections
   */
  getAllDefinitions(): Map<DefinitionBlockName, DefinitionCollection> {
    return new Map(this.definitions);
  }

  /**
   * Get the total count of definition types
   */
  getDefinitionTypeCount(): number {
    return this.definitions.size;
  }

  /**
   * Get the total count of all definitions across all types
   */
  getTotalDefinitionCount(): number {
    let total = 0;
    for (const definitions of this.definitions.values()) {
      total += definitions.length;
    }
    return total;
  }

  // Type-safe convenience methods for specific definition types

  /**
   * Get key definitions
   */
  getKeyDefinitions(): AwspKeyDefinition[] | undefined {
    return this.getDefinitions<AwspKeyDefinition[]>(
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
    );
  }

  /**
   * Get tag definitions
   */
  getTagDefinitions(): TagDefinition[] | undefined {
    return this.getDefinitions<TagDefinition[]>(
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
    );
  }

  /**
   * Get SPF property definitions
   */
  getSpfPropertyDefinitions(): SpfPropertyDefinition[] | undefined {
    return this.getDefinitions<SpfPropertyDefinition[]>(
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
    );
  }

  /**
   * Get driver property definitions
   */
  getDriverPropertyDefinitions(): DriverPropertyDefinition[] | undefined {
    return this.getDefinitions<DriverPropertyDefinition[]>(
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
    );
  }

  /**
   * Get SPF module definitions
   */
  getSpfModuleDefinitions(): SpfModuleDefinition[] | undefined {
    return this.getDefinitions<SpfModuleDefinition[]>(
      DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS,
    );
  }

  /**
   * Get driver module definitions
   */
  getDriverModuleDefinitions(): DriverModuleDefinition[] | undefined {
    return this.getDefinitions<DriverModuleDefinition[]>(
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
    );
  }

  /**
   * Get processor definitions
   */
  getProcessorDefinitions(): ProcessorDefinition[] | undefined {
    return this.getDefinitions<ProcessorDefinition[]>(
      DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS,
    );
  }

  /**
   * Get container type definitions
   */
  getContainerTypes(): ContainerType[] | undefined {
    return this.getDefinitions<ContainerType[]>(
      DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES,
    );
  }
}
