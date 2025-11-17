import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {HANDLER_KEYS} from '../../../shared/constants/registry-keys.js';
import {KeyDefinition as AwspKeyDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import {KeyDefinition as DomainKeyDefinition} from '../../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import {ValueDefinition as DomainValueDefinition} from '../../../../../domain/entities/definitions/key-value/entities/value-definition.js';
import type {SpecialKey} from '../../../shared/awsp-serializers/v1/definitions/key-definition/type/special-key-type.js';
import type {SpecialtyKey} from '../../../../../domain/entities/definitions/common/enums/speciality-type.js';

/**
 * Input structure for key definition building tasks
 */
export interface KeyDefinitionBuildInput {
  /** Array of AWSP key definitions to transform */
  keyDefinitions: AwspKeyDefinition[];
  /** File system ID for the key definitions */
  fileSystemId: number;
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Output structure for key definition building tasks
 */
export interface KeyDefinitionBuildOutput {
  /** Successfully transformed key definitions */
  validKeyDefinitions: DomainKeyDefinition[];
  /** Errors encountered during transformation */
  errors: Array<{keyId: number; keyName: string; error: string}>;
}

/**
 * Service responsible for building domain KeyDefinition entities from AWSP KeyDefinitions.
 * Supports both parallel and sequential processing with worker pool integration.
 */
export class KeyDefinitionBuilder {
  constructor(
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build domain KeyDefinition entities from AWSP KeyDefinitions
   * @param awspKeyDefinitions - Array of AWSP key definitions to transform
   * @returns Promise resolving to array of domain key definitions
   */
  async buildKeyDefinitions(
    awspKeyDefinitions: AwspKeyDefinition[],
  ): Promise<DomainKeyDefinition[]> {
    if (!awspKeyDefinitions || awspKeyDefinitions.length === 0) {
      return [];
    }

    this.logger?.logDebug({
      msg: `Building ${awspKeyDefinitions.length} key definitions`,
      action: 'key_definition_building_start',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    let result: DomainKeyDefinition[];

    // Determine processing strategy
    const useParallel = this.shouldUseParallel(awspKeyDefinitions);

    try {
      if (useParallel) {
        result = await this.buildParallel(awspKeyDefinitions);
      } else {
        result = await this.buildSequential(awspKeyDefinitions);
      }

      this.logger?.logInfo({
        msg: `Successfully built ${result.length} key definitions`,
        action: 'key_definition_building_complete',
        component: 'KeyDefinitionBuilderService',
        tag: 'key-definitions',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'Key definition building failed',
        action: 'key_definition_building_failed',
        component: 'KeyDefinitionBuilderService',
        tag: 'key-definitions',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
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
  ): Promise<DomainKeyDefinition[]> {
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
    const task1Definitions = keyDefinitions.slice(0, midpoint);
    const task2Definitions = keyDefinitions.slice(midpoint);

    const tasks: WorkerTask<KeyDefinitionBuildInput>[] = [];

    // Task 1: First half
    if (task1Definitions.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_KEY_DEFINITIONS,
        input: {
          keyDefinitions: task1Definitions,
          fileSystemId: 1, // Hardcoded as requested
          taskName: `Key definitions batch 1 (${task1Definitions.length} items)`,
        },
      });
    }

    // Task 2: Second half
    if (task2Definitions.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_KEY_DEFINITIONS,
        input: {
          keyDefinitions: task2Definitions,
          fileSystemId: 1, // Hardcoded as requested
          taskName: `Key definitions batch 2 (${task2Definitions.length} items)`,
        },
      });
    }

    // Execute tasks in parallel
    const results = await this.workerPool.executeParallel<
      KeyDefinitionBuildInput,
      unknown,
      KeyDefinitionBuildOutput
    >(tasks);

    // Process results and collect valid key definitions
    const validKeyDefinitions: DomainKeyDefinition[] = [];
    let totalErrors = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
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
      totalErrors += output.errors.length;

      // Log individual errors with safe error handling
      output.errors.forEach(error => {
        this.logger?.logError({
          msg: `Failed to build key definition ${error.keyId} (${error.keyName}): ${error.error}`,
          action: 'key_definition_transform_error',
          component: 'KeyDefinitionBuilderService',
          tag: 'key-definitions',
          error: new Error(error.error || 'Unknown error'),
          timestamp: new Date(),
        });
      });
    }

    this.logger?.logInfo({
      msg: `Parallel processing completed: ${validKeyDefinitions.length} valid, ${totalErrors} errors`,
      action: 'parallel_key_building_complete',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    return validKeyDefinitions;
  }

  /**
   * Build key definitions sequentially in the main thread
   */
  private async buildSequential(
    keyDefinitions: AwspKeyDefinition[],
  ): Promise<DomainKeyDefinition[]> {
    this.logger?.logDebug({
      msg: `Building ${keyDefinitions.length} key definitions sequentially`,
      action: 'sequential_key_building_start',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    const validKeyDefinitions: DomainKeyDefinition[] = [];
    let errorCount = 0;

    for (const awspKeyDef of keyDefinitions) {
      try {
        const domainKeyDef =
          KeyDefinitionBuilder.transformKeyDefinition(awspKeyDef);
        validKeyDefinitions.push(domainKeyDef);
      } catch (error) {
        errorCount++;

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
      msg: `Sequential processing completed: ${validKeyDefinitions.length} valid, ${errorCount} errors`,
      action: 'sequential_key_building_complete',
      component: 'KeyDefinitionBuilderService',
      tag: 'key-definitions',
      timestamp: new Date(),
    });

    return validKeyDefinitions;
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
   * This method is used both in sequential processing and worker threads
   */
  static transformKeyDefinition(awsp: AwspKeyDefinition): DomainKeyDefinition {
    // Transform value definitions
    const domainValues: DomainValueDefinition[] = [];

    if (awsp.values && Array.isArray(awsp.values)) {
      for (const awspValue of awsp.values) {
        try {
          const domainValue = new DomainValueDefinition({
            systemId: 0, // Will be generated during insertion
            valueId: awspValue.id,
            name: awspValue.name,
            description: awspValue.description || '',
            cHeaderEnumValue: awspValue.enumValue,
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
    const domainKeyDef = new DomainKeyDefinition({
      systemId: 0, // Will be generated during insertion
      keyId: awsp.id,
      fileSystemId: 1, // Hardcoded as requested
      name: awsp.name,
      description: awsp.description || '',
      isCalibrationKey: awsp.isCalKey ?? false,
      isGraphKey: awsp.isGraphKey ?? false,
      isVoice: awsp.isVoice ?? false,
      isDynamic: awsp.isDynamic ?? false,

      // TODO: Implement specialty mapping when available
      specialityKeyValue: awsp.specialty
        ? {
            key: KeyDefinitionBuilder.mapSpecialKey(awsp.specialty),
            value: '', // Placeholder - will be implemented later
          }
        : undefined,

      cHeaderAttributes: {
        keyEnumName: awsp.enumName,
        keyEnumValue: awsp.enumValue,
        calibrationEnumValue: awsp.calKeyEnumValue,
        graphEnumValue: awsp.graphKeyEnumValue,
      },
    });

    // Add value definitions to the key definition
    for (const value of domainValues) {
      domainKeyDef.AddValue(value);
    }

    return domainKeyDef;
  }

  /**
   * Static method for building key definitions in worker threads
   * This method is called by the worker registry
   */
  static buildKeyDefinitions(
    input: KeyDefinitionBuildInput,
  ): KeyDefinitionBuildOutput {
    const validKeyDefinitions: DomainKeyDefinition[] = [];
    const errors: Array<{keyId: number; keyName: string; error: string}> = [];

    for (const awspKeyDef of input.keyDefinitions) {
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
