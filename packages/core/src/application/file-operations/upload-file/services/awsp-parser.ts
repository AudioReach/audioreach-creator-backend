/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// IMPORTANT: reflect-metadata must be imported first, before any other imports
// This polyfill is required for class-transformer decorators to work
// eslint-disable-next-line n/no-extraneous-import -- Required polyfill for class-transformer decorators
import 'reflect-metadata';

import {plainToInstance} from 'class-transformer';
import type {ClassConstructor} from 'class-transformer';
import {DefinitionValidatorService} from './validations/definition-validator.service.js';
import {DEFINITION_BLOCK_NAMES} from '../../shared/constants/definition-block-names.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../ports/worker/worker-types.js';
import type {JsonObject} from '../../../../shared/types/json-types.js';
import {
  type DefinitionBlockName,
  type DefinitionCollection,
} from '../models/parsed-awsp.js';
import {
  ContainerType,
  DriverModuleDefinition,
  DriverPropertyDefinition,
  KeyDefinition,
  ProcessorDefinition,
  SpfModuleDefinition,
  SpfPropertyDefinition,
  TagDefinition,
} from '../../shared/awsp-serializers/v1/definitions/index.js';

/**
 * Input structure for definition parsing tasks
 */
export interface DefinitionParseInput {
  /** Object containing definition blocks to parse */
  definitionBlocks: Record<string, JsonObject[]>;
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Service responsible for parsing AWSP definition content.
 * Contains all definition parsing business logic with parallel processing support.
 */
export class AwspParser {
  private readonly definitionValidator: DefinitionValidatorService;

  constructor(private readonly workerPool?: WorkerPoolPort) {
    this.definitionValidator = new DefinitionValidatorService();
  }

  /**
   * Static method for parsing definitions in worker threads.
   * This method is called by the worker registry and contains the core parsing logic.
   * @param input - Definition parsing input containing blocks to parse
   * @returns Parsed definitions object (only includes blocks with data)
   */
  static parse(
    input: DefinitionParseInput,
  ): Record<string, DefinitionCollection> {
    const results: Record<string, DefinitionCollection> = {};

    // Process each definition block provided in the input
    for (const [blockName, blockData] of Object.entries(
      input.definitionBlocks,
    )) {
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        try {
          // Get the appropriate class type for this block
          const classType = AwspParser.getClassTypeForBlock(blockName);

          // Transform the data using class-transformer
          const parsedData = plainToInstance(classType, blockData, {
            excludeExtraneousValues: true,
          });

          results[blockName] = parsedData as DefinitionCollection;
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(`Failed to parse ${blockName}: ${error.message}`);
          }
          throw new Error(`Failed to parse ${blockName}: Unknown error`);
        }
      } else {
        // Log warning for empty or missing blocks
        console.warn(
          `Definition block '${blockName}' is empty or missing - skipping`,
        );
      }
    }

    return results;
  }

  /**
   * Static method to map definition block names to their corresponding class constructors.
   * This enables generic definition parsing without hardcoded type logic.
   */
  private static getClassTypeForBlock(
    blockName: string,
  ): ClassConstructor<unknown> {
    const classMap: Record<string, ClassConstructor<unknown>> = {
      [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: KeyDefinition,
      [DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]: TagDefinition,
      [DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS]: SpfPropertyDefinition,
      [DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS]:
        DriverPropertyDefinition,
      [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: SpfModuleDefinition,
      [DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS]:
        DriverModuleDefinition,
      [DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS]: ProcessorDefinition,
      [DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES]: ContainerType,
    };

    const classType = classMap[blockName];
    if (!classType) {
      throw new Error(`Unknown definition block name: ${blockName}`);
    }

    return classType;
  }

  /**
   * Parse all definitions from pre-parsed JSON data with parallel/sequential strategy
   * @param jsonData - Pre-parsed JSON object containing definition blocks
   * @returns Promise resolving to structured definitions (only includes blocks with data)
   */
  async parseDefinitions(
    jsonData: Record<string, JsonObject[]>,
  ): Promise<Record<string, DefinitionCollection>> {
    // Determine parsing strategy
    const useParallel = this.shouldUseParallelParsing();

    let parsedDefinitions: Record<string, DefinitionCollection>;

    // Step 1: Parse definitions using selected strategy
    try {
      if (useParallel && this.workerPool) {
        parsedDefinitions = await this.parseDefinitionsParallel(jsonData);
      } else {
        parsedDefinitions = this.parseDefinitionsSequential(jsonData);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Parsing failed: ${error.message}`);
      }
      throw new Error('Parsing failed: Unknown error');
    }

    // TODO: Validation temporarily disabled - will be re-enabled after review
    // The definitionValidator is kept as a field for future use
    if (this.definitionValidator) {
      // Intentionally empty - placeholder for future validation logic
    }

    /* TODO: commenting validation for now, check and add back later.
    // Step 2: Validate parsed definitions
    try {
      await this.definitionValidator.validateAllDefinitions(parsedDefinitions);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Validation failed: ${error.message}`);
      }
      throw new Error('Validation failed: Unknown error');
    }*/
    return parsedDefinitions;
  }

  /**
   * Determine if parallel parsing should be used
   */
  private shouldUseParallelParsing(): boolean {
    // Use parallel processing if worker pool is available and threading is supported
    return (
      this.workerPool !== undefined && this.workerPool.isThreadingSupported()
    );
  }

  /**
   * Parse definitions using worker pool - SPF modules in one worker, others in another
   */
  private async parseDefinitionsParallel(
    jsonData: Record<string, JsonObject[]>,
  ): Promise<Record<string, DefinitionCollection>> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel parsing');
    }

    // Create two tasks: one for SPF modules, one for all others
    const tasks: WorkerTask<DefinitionParseInput>[] = [];

    // Task 1: SPF Module Definitions (separate worker)
    const spfModuleData =
      jsonData[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS];
    if (
      spfModuleData &&
      Array.isArray(spfModuleData) &&
      spfModuleData.length > 0
    ) {
      tasks.push({
        handlerKey: HANDLER_KEYS.PARSE_DEFINITION,
        input: {
          definitionBlocks: {
            [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: spfModuleData,
          },
          taskName: 'SPF module definitions',
        },
      });
    }

    // Task 2: All other definitions (combined in one worker)
    const otherDefinitionBlocks: Record<string, JsonObject[]> = {};

    // Add each definition type if it has data
    const otherBlockNames = [
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES,
    ];

    for (const blockName of otherBlockNames) {
      const blockData = jsonData[blockName];
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        otherDefinitionBlocks[blockName] = blockData;
      }
    }

    if (Object.keys(otherDefinitionBlocks).length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.PARSE_DEFINITION,
        input: {
          definitionBlocks: otherDefinitionBlocks,
          taskName: 'other definitions',
        },
      });
    }

    // Execute tasks in parallel
    const results = await this.workerPool.executeParallel<
      DefinitionParseInput,
      unknown,
      Record<DefinitionBlockName, DefinitionCollection>
    >(tasks);

    // Process results
    const parsedDefinitions: Record<string, DefinitionCollection> = {};

    for (const [i, result] of results.entries()) {
      const task = tasks[i];

      if (!result.success || result.error) {
        throw new Error(
          `Failed to parse ${task.input.taskName}: ${result.error}`,
        );
      }

      // Merge results from worker into final definitions object
      const workerResults = result.data as Record<string, DefinitionCollection>;
      Object.assign(parsedDefinitions, workerResults);
    }

    return parsedDefinitions;
  }

  /**
   * Parse definitions sequentially using the same static parse method as workers (optimized)
   */
  private parseDefinitionsSequential(
    jsonData: Record<string, JsonObject[]>,
  ): Record<string, DefinitionCollection> {
    // Collect all definition blocks that have data
    const definitionBlocks: Record<string, JsonObject[]> = {};

    const allBlockNames = [
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES,
    ];

    for (const blockName of allBlockNames) {
      const blockData = jsonData[blockName];
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        definitionBlocks[blockName] = blockData;
      }
    }

    // Use the same parsing logic as workers for consistency
    return AwspParser.parse({
      definitionBlocks,
      taskName: 'sequential parsing',
    });
  }
}
