/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import {HANDLER_KEYS} from '../../../shared/constants/registry-keys.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import {AwspKeyDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import {KeyDefinition} from '../../../../../domain/entities/definitions/key-value/key-definition.js';
import {ValueDefinition} from '../../../../../domain/entities/definitions/key-value/entities/value-definition.js';
import type {SpecialKey} from '../../../shared/awsp-serializers/v1/definitions/key-definition/type/special-key-type.js';
import type {SpecialtyKey} from '../../../../../domain/entities/definitions/common/types/speciality-type.js';
import type {BuildResult} from '../../types/issue-collection.js';
import type {Issue} from '../../../../../shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../shared/issues/index.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

/**
 * Input structure for key definition building tasks
 */
export interface KeyDefinitionBuildInput {
  /** Array of AWSP key definitions to transform */
  awspKeyDefinitions: AwspKeyDefinition[];
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Output structure for key definition building tasks
 */
export interface KeyDefinitionBuildOutput {
  /** Successfully transformed key definitions */
  validKeyDefinitions: KeyDefinition[];
  /** Errors encountered during transformation */
  errors: Array<{keyId: number; keyName: string; error: string}>;
}

/**
 * Service responsible for building domain KeyDefinition entities from AWSP KeyDefinitions.
 * Supports both parallel and sequential processing with worker pool integration.
 */
export class KeyDefinitionBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build domain KeyDefinition entities from AWSP KeyDefinitions with system IDs assigned
   * @param awspKeyDefinitions - Array of AWSP key definitions to transform
   * @param fileSystemId - File system ID to assign to entities
   * @returns Promise resolving to BuildResult with entities and errors
   */
  async buildKeyDefinitions(
    awspKeyDefinitions: AwspKeyDefinition[],
    fileSystemId: number,
  ): Promise<BuildResult<KeyDefinition>> {
    if (!awspKeyDefinitions || awspKeyDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    let result: BuildResult<KeyDefinition>;

    // Determine processing strategy
    const useParallel = this.shouldUseParallel(awspKeyDefinitions);

    try {
      // Step 1: Build entities (systemId = 0)
      result = await (useParallel
        ? this.buildParallel(awspKeyDefinitions)
        : this.buildSequential(awspKeyDefinitions));

      // Step 2: Assign system IDs to all successfully built entities
      if (result.entities.length > 0) {
        await this.assignSystemIds(result.entities, fileSystemId);
      }

      this.logger?.logInfo({
        msg: `Successfully built ${result.entities.length} key definitions with system IDs assigned, ${result.issues.length} failures`,
        action: 'key_definition_building_complete',
        component: 'KeyDefinitionBuilder',
        tag: 'key-definitions',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'Key definition building failed',
        action: 'key_definition_building_failed',
        component: 'KeyDefinitionBuilder',
        tag: 'key-definitions',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Assign system IDs to key definitions and their value definitions.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param keyDefinitions - Key definitions with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    keyDefinitions: KeyDefinition[],
    fileSystemId: number,
  ): Promise<void> {
    for (const keyDef of keyDefinitions) {
      // Assign file system ID
      keyDef.fileSystemId = fileSystemId;

      // Assign system ID to key definition
      keyDef.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store key definition mapping immediately
      this.foreignKeyMapper.addKeyDefinitionMapping(
        asNaturalId(keyDef.keyId),
        asSystemId(keyDef.systemId),
      );

      // Assign system IDs to value definitions and store mappings
      for (const valueDef of keyDef.values) {
        valueDef.systemId = await this.idGenerator.getNextId(fileSystemId);

        // Store value definition mapping immediately
        this.foreignKeyMapper.addValueDefinitionMapping(
          asNaturalId(keyDef.keyId),
          asNaturalId(valueDef.valueId),
          asSystemId(valueDef.systemId),
        );
      }
    }
  }

  /**
   * Determine if parallel processing should be used
   */
  private shouldUseParallel(keyDefinitions: AwspKeyDefinition[]): boolean {
    return (
      this.workerPool !== undefined &&
      this.workerPool.isThreadingSupported() &&
      keyDefinitions.length > 1 // Use parallel if we have more than 1 key definition
    );
  }

  /**
   * Build key definitions using parallel processing with 2 workers
   */
  private async buildParallel(
    keyDefinitions: AwspKeyDefinition[],
  ): Promise<BuildResult<KeyDefinition>> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel processing');
    }

    this.logger?.logDebug({
      msg: `Building ${keyDefinitions.length} key definitions in parallel (2 tasks)`,
      action: 'parallel_key_building_start',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    // Split into exactly 2 tasks as requested
    const midpoint = Math.floor(keyDefinitions.length / 2);
    const task1Items = keyDefinitions.slice(0, midpoint);
    const task2Items = keyDefinitions.slice(midpoint);

    const tasks: WorkerTask<KeyDefinitionBuildInput>[] = [];

    // Task 1: First half
    if (task1Items.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_KEY_DEFINITIONS,
        input: {
          awspKeyDefinitions: task1Items,
          taskName: `Key definitions batch 1 (${task1Items.length} items)`,
        },
      });
    }

    // Task 2: Second half
    if (task2Items.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_KEY_DEFINITIONS,
        input: {
          awspKeyDefinitions: task2Items,
          taskName: `Key definitions batch 2 (${task2Items.length} items)`,
        },
      });
    }

    // Execute tasks in parallel
    const results = await this.workerPool.executeParallel<
      KeyDefinitionBuildInput,
      unknown,
      KeyDefinitionBuildOutput
    >(tasks);

    // Process results and collect valid key definitions and issues
    const validKeyDefinitions: KeyDefinition[] = [];
    const issues: Issue[] = [];

    for (const [i, result] of results.entries()) {
      const task = tasks[i];

      if (!result.success || result.error) {
        this.logger?.logError({
          msg: `Failed to build ${task.input.taskName}: ${result.error}`,
          action: 'parallel_task_failed',
          component: 'KeyDefinitionBuilderService',
          tag: 'key-definitions',
          error: new Error(result.error || 'Unknown error'),
          timestamp: new Date(),
        });
        continue;
      }

      const output = result.data as KeyDefinitionBuildOutput;
      validKeyDefinitions.push(...output.validKeyDefinitions);

      // Convert worker errors to Issue format
      for (const error of output.errors) {
        const entityBuildIssue = this.convertToEntityBuildIssue(error.error);
        issues.push(entityBuildIssue);

        this.logger?.logError({
          msg: `Failed to build key definition ${error.keyId} (${error.keyName}): ${error.error}`,
          action: 'key_definition_transform_error',
          component: 'KeyDefinitionBuilderService',
          tag: 'key-definitions',
          error: new Error(error.error || 'Unknown error'),
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Parallel processing completed: ${validKeyDefinitions.length} valid, ${issues.length} errors`,
      action: 'parallel_key_building_complete',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    return {
      entities: validKeyDefinitions,
      issues: issues,
    };
  }

  /**
   * Build key definitions sequentially in the main thread
   * Creates objects with systemId = 0 and fileSystemId = 0 (to be assigned later)
   */
  private buildSequential(
    keyDefinitions: AwspKeyDefinition[],
  ): BuildResult<KeyDefinition> {
    this.logger?.logDebug({
      msg: `Building ${keyDefinitions.length} key definitions sequentially`,
      action: 'sequential_key_building_start',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    const validKeyDefinitions: KeyDefinition[] = [];
    const issues: Issue[] = [];

    for (const awspKeyDef of keyDefinitions) {
      try {
        const domainKeyDef =
          KeyDefinitionBuilder.transformKeyDefinition(awspKeyDef);
        validKeyDefinitions.push(domainKeyDef);
      } catch (error) {
        // Create diagnostic information for better error analysis
        const diagnosticInfo = {
          keyId: awspKeyDef.id,
          keyName: awspKeyDef.name,
          isCalKey: awspKeyDef.isCalKey,
          isGraphKey: awspKeyDef.isGraphKey,
          specialty: awspKeyDef.specialty,
          valuesCount: awspKeyDef.values?.length || 0,
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        };

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const detailedMessage = `${errorMessage} | Diagnostic: ${JSON.stringify(diagnosticInfo)}`;

        // Convert to Issue format
        const entityBuildIssue =
          this.convertToEntityBuildIssue(detailedMessage);
        issues.push(entityBuildIssue);

        this.logger?.logError({
          msg: `Failed to build key definition ${awspKeyDef.id} (${awspKeyDef.name}): ${detailedMessage}`,
          action: 'key_definition_transform_error',
          component: 'KeyDefinitionBuilder',
          tag: 'key-definitions',
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Sequential processing completed: ${validKeyDefinitions.length} valid, ${issues.length} errors`,
      action: 'sequential_key_building_complete',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    return {
      entities: validKeyDefinitions,
      issues: issues,
    };
  }

  /**
   * Convert builder error to Issue format
   */
  private convertToEntityBuildIssue(message: string): Issue {
    return {
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.KeyDefinition,
        systemId: 0,
      },
    };
  }

  /**
   * Map AWSP SpecialKey to Domain SpecialtyKey
   */
  private static mapSpecialKey(awspSpecialKey: SpecialKey): SpecialtyKey {
    const mapping: Record<SpecialKey, SpecialtyKey> = {
      None: 'NONE',
      SampleRate: 'SAMPLE_RATE',
      Volume: 'VOLUME',
    };
    return mapping[awspSpecialKey];
  }

  /**
   * Static method for transforming AWSP KeyDefinition to Domain KeyDefinition
   * Creates objects with placeholder IDs (systemId = 0, fileSystemId = 0)
   * IDs will be assigned later during the build process
   * This method is used both in sequential processing and worker threads
   */
  static transformKeyDefinition(awsp: AwspKeyDefinition): KeyDefinition {
    // Transform value definitions
    const domainValues: ValueDefinition[] = [];

    if (awsp.values && Array.isArray(awsp.values)) {
      for (let i = 0; i < awsp.values.length; i++) {
        const awspValue = awsp.values[i];
        try {
          const domainValue = new ValueDefinition({
            systemId: 0, // Will be generated during insertion
            valueId: awspValue.id,
            name: awspValue.name,
            description: awspValue.description,
            enumMember: awspValue.enumMember,
            specialValue: awspValue.specialValue, // TODO: Implement specialty mapping when available
          });
          domainValues.push(domainValue);
        } catch (error) {
          throw new Error(
            `Failed to transform value definition ${awspValue.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // Create domain key definition
    const domainKeyDef = new KeyDefinition({
      systemId: 0, // Will be generated during insertion
      keyId: awsp.id,
      fileSystemId: 0, // Placeholder - will be assigned during build process
      name: awsp.name,
      description: awsp.description,
      isCalibrationKey: awsp.isCalKey ?? true, //TODO: fix workspace file
      isGraphKey: awsp.isGraphKey ?? true, //TODO: fix workspace file
      isVoice: awsp.isVoice ?? false,
      isDynamic: awsp.isDynamic ?? false,
      values: domainValues,

      // TODO: Implement specialty mapping when available
      specialityKeyValue: awsp.specialty
        ? {
            key: KeyDefinitionBuilder.mapSpecialKey(awsp.specialty),
            value: '', // Placeholder - will be implemented later
          }
        : undefined,

      cHeaderAttributes: {
        enumMember: awsp.enumName,
        enumName: awsp.enumMember,
        calKeyEnumMember: awsp.calKeyEnumMember,
        graphKeyEnumMember: awsp.graphKeyEnumMember,
      },
    });

    return domainKeyDef;
  }

  /**
   * Static method for building key definitions in worker threads
   * This method is called by the worker registry
   */
  static buildKeyDefinitions(
    input: KeyDefinitionBuildInput,
  ): KeyDefinitionBuildOutput {
    const validKeyDefinitions: KeyDefinition[] = [];
    const errors: Array<{keyId: number; keyName: string; error: string}> = [];

    for (const awspKeyDef of input.awspKeyDefinitions) {
      try {
        const domainKeyDef =
          KeyDefinitionBuilder.transformKeyDefinition(awspKeyDef);
        validKeyDefinitions.push(domainKeyDef);
      } catch (error) {
        // Enhanced error capture with diagnostic information
        const rawErrorMessage =
          error instanceof Error ? error.message : String(error);

        // Ensure we never have empty error messages
        const errorMessage = rawErrorMessage?.trim() || 'Unknown error';

        const diagnosticInfo = {
          keyId: awspKeyDef.id,
          keyName: awspKeyDef.name,
          isCalKey: awspKeyDef.isCalKey,
          isGraphKey: awspKeyDef.isGraphKey,
          specialty: awspKeyDef.specialty,
          valuesCount: awspKeyDef.values?.length || 0,
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        };

        // Create detailed error message with diagnostic context
        const detailedError = `${errorMessage} | Diagnostic: ${JSON.stringify(diagnosticInfo)}`;

        errors.push({
          keyId: awspKeyDef.id,
          keyName: awspKeyDef.name,
          error: detailedError,
        });
      }
    }

    return {
      validKeyDefinitions,
      errors,
    };
  }
}
