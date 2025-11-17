import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {HANDLER_KEYS} from '../../../shared/constants/registry-keys.js';
import {SpfModuleDefinition as AwspSpfModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import {SpfModuleDefinition as DomainSpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
import {DataPortGroupDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/data-port-group-definition.js';
import {StaticControlPortDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/static-control-port-definition.js';
import {DynamicIntentDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/dynamic-intent-definition.js';

/**
 * Input structure for SPF module definition building tasks
 */
export interface SpfModuleDefinitionBuildInput {
  /** Array of AWSP SPF module definitions to transform */
  moduleDefinitions: AwspSpfModuleDefinition[];
  /** File system ID for the module definitions */
  fileSystemId: number;
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Output structure for SPF module definition building tasks
 */
export interface SpfModuleDefinitionBuildOutput {
  /** Successfully transformed SPF module definitions */
  validModuleDefinitions: DomainSpfModuleDefinition[];
  /** Errors encountered during transformation */
  errors: Array<{moduleId: number; moduleName: string; error: string}>;
}

/**
 * Service responsible for building domain SpfModuleDefinition entities from AWSP SpfModuleDefinitions.
 * Supports both parallel and sequential processing with worker pool integration.
 */
export class SpfModuleDefinitionBuilder {
  constructor(
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build domain SpfModuleDefinition entities from AWSP SpfModuleDefinitions
   * @param awspModuleDefinitions - Array of AWSP SPF module definitions to transform
   * @returns Promise resolving to array of domain SPF module definitions
   */
  async buildModuleDefinitions(
    awspModuleDefinitions: AwspSpfModuleDefinition[],
  ): Promise<DomainSpfModuleDefinition[]> {
    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return [];
    }

    this.logger?.logDebug({
      msg: `Building ${awspModuleDefinitions.length} SPF module definitions`,
      action: 'spf_module_definition_building_start',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    let result: DomainSpfModuleDefinition[];

    // Determine processing strategy
    const useParallel = this.shouldUseParallel(awspModuleDefinitions);

    try {
      if (useParallel) {
        result = await this.buildParallel(awspModuleDefinitions);
      } else {
        result = await this.buildSequential(awspModuleDefinitions);
      }

      this.logger?.logInfo({
        msg: `Successfully built ${result.length} SPF module definitions`,
        action: 'spf_module_definition_building_complete',
        component: 'SpfModuleDefinitionBuilder',
        tag: 'spf-module-definitions',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'SPF module definition building failed',
        action: 'spf_module_definition_building_failed',
        component: 'SpfModuleDefinitionBuilder',
        tag: 'spf-module-definitions',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Determine if parallel processing should be used
   */
  private shouldUseParallel(
    moduleDefinitions: AwspSpfModuleDefinition[],
  ): boolean {
    return (
      this.workerPool !== undefined &&
      this.workerPool.isThreadingSupported() &&
      moduleDefinitions.length > 1 // Use parallel if we have more than 1 module definition
    );
  }

  /**
   * Build SPF module definitions using parallel processing with 2 workers
   */
  private async buildParallel(
    moduleDefinitions: AwspSpfModuleDefinition[],
  ): Promise<DomainSpfModuleDefinition[]> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel processing');
    }

    this.logger?.logDebug({
      msg: `Building ${moduleDefinitions.length} SPF module definitions in parallel (2 tasks)`,
      action: 'parallel_spf_module_building_start',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    // Split into exactly 2 tasks as requested
    const midpoint = Math.floor(moduleDefinitions.length / 2);
    const task1Definitions = moduleDefinitions.slice(0, midpoint);
    const task2Definitions = moduleDefinitions.slice(midpoint);

    const tasks: WorkerTask<SpfModuleDefinitionBuildInput>[] = [];

    // Task 1: First half
    if (task1Definitions.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_SPF_MODULE_DEFINITIONS,
        input: {
          moduleDefinitions: task1Definitions,
          fileSystemId: 1, // Hardcoded as requested
          taskName: `SPF module definitions batch 1 (${task1Definitions.length} items)`,
        },
      });
    }

    // Task 2: Second half
    if (task2Definitions.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_SPF_MODULE_DEFINITIONS,
        input: {
          moduleDefinitions: task2Definitions,
          fileSystemId: 1, // Hardcoded as requested
          taskName: `SPF module definitions batch 2 (${task2Definitions.length} items)`,
        },
      });
    }

    // Execute tasks in parallel
    const results = await this.workerPool.executeParallel<
      SpfModuleDefinitionBuildInput,
      unknown,
      SpfModuleDefinitionBuildOutput
    >(tasks);

    // Process results and collect valid module definitions
    const validModuleDefinitions: DomainSpfModuleDefinition[] = [];
    let totalErrors = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const task = tasks[i];

      if (!result.success || result.error) {
        this.logger?.logError({
          msg: `Failed to build ${task.input.taskName}: ${result.error}`,
          action: 'parallel_task_failed',
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: new Error(result.error || 'Unknown error'),
          timestamp: new Date(),
        });
        continue;
      }

      const output = result.data as SpfModuleDefinitionBuildOutput;
      validModuleDefinitions.push(...output.validModuleDefinitions);
      totalErrors += output.errors.length;

      // Log individual errors
      output.errors.forEach(error => {
        // Debug log to see what error data we're receiving
        this.logger?.logDebug({
          msg: `Processing error for module ${error.moduleId}: error type=${typeof error.error}, length=${typeof error.error === 'string' ? error.error.length : 'N/A'}`,
          action: 'error_data_debug',
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          timestamp: new Date(),
        });

        this.logger?.logError({
          msg: `Failed to build SPF module definition ${error.moduleId} (${error.moduleName}): ${error.error}`,
          action: 'spf_module_definition_transform_error',
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: new Error(error.error || 'Unknown error'),
          timestamp: new Date(),
        });
      });
    }

    this.logger?.logInfo({
      msg: `Parallel processing completed: ${validModuleDefinitions.length} valid, ${totalErrors} errors`,
      action: 'parallel_spf_module_building_complete',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    return validModuleDefinitions;
  }

  /**
   * Build SPF module definitions sequentially in the main thread
   */
  private async buildSequential(
    moduleDefinitions: AwspSpfModuleDefinition[],
  ): Promise<DomainSpfModuleDefinition[]> {
    this.logger?.logDebug({
      msg: `Building ${moduleDefinitions.length} SPF module definitions sequentially`,
      action: 'sequential_spf_module_building_start',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    const validModuleDefinitions: DomainSpfModuleDefinition[] = [];
    let errorCount = 0;

    for (const awspModuleDef of moduleDefinitions) {
      try {
        const domainModuleDef =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModuleDef);
        validModuleDefinitions.push(domainModuleDef);
      } catch (error) {
        errorCount++;

        // Create diagnostic information for better error analysis
        const diagnosticInfo = {
          moduleId: awspModuleDef.id,
          moduleName: awspModuleDef.name,
          supportedProcessorsCount:
            awspModuleDef.supportedProcessorIds?.length || 0,
          supportedContainersCount:
            awspModuleDef.supportedContainerTypes?.length || 0,
          hasInputPorts: !!awspModuleDef.inputPortsInfo,
          hasOutputPorts: !!awspModuleDef.outputPortsInfo,
          hasControlPorts: !!awspModuleDef.controlPortsInfo,
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        };

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const detailedMessage = `${errorMessage} | Diagnostic: ${JSON.stringify(diagnosticInfo)}`;

        this.logger?.logError({
          msg: `Failed to build SPF module definition ${awspModuleDef.id} (${awspModuleDef.name}): ${detailedMessage}`,
          action: 'spf_module_definition_transform_error',
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Sequential processing completed: ${validModuleDefinitions.length} valid, ${errorCount} errors`,
      action: 'sequential_spf_module_building_complete',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    return validModuleDefinitions;
  }

  /**
   * Static method for transforming AWSP SpfModuleDefinition to Domain SpfModuleDefinition
   * This method is used both in sequential processing and worker threads
   */
  static transformModuleDefinition(
    awsp: AwspSpfModuleDefinition,
  ): DomainSpfModuleDefinition {
    // Create input data port group
    const inputDataPortsGroup = new DataPortGroupDefinition({
      max: awsp.inputPortsInfo?.maxPortCount || 0,
      portIoType: 'INPUT', // TODO: Map from AWSP when available
      staticPortDefinitions: [], // TODO: Map ports when available
    });

    // Create output data port group
    const outputDataPortsGroup = new DataPortGroupDefinition({
      max: awsp.outputPortsInfo?.maxPortCount || 0,
      portIoType: 'OUTPUT', // TODO: Map from AWSP when available
      staticPortDefinitions: [], // TODO: Map ports when available
    });

    // Transform static control ports
    const staticControlPorts: StaticControlPortDefinition[] = [];
    if (awsp.controlPortsInfo?.staticPorts) {
      for (const awspPort of awsp.controlPortsInfo.staticPorts) {
        try {
          const staticPort = new StaticControlPortDefinition({
            portId: awspPort.id,
            portName: awspPort.name || `Port_${awspPort.id}`,
          });
          staticControlPorts.push(staticPort);
        } catch (error) {
          throw new Error(
            `Failed to transform static control port ${awspPort.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // Create domain SPF module definition
    const domainModuleDef = new DomainSpfModuleDefinition({
      systemId: 0, // Will be generated during insertion
      moduleDefinitionId: awsp.id,
      fileSystemId: 1, // Hardcoded as requested
      name: awsp.name,
      displayName: awsp.displayName || awsp.name,
      description: awsp.description || '',
      inputDataPortsGroup,
      outputDataPortsGroup,
      staticControlPorts,
      processorSystemIds: awsp.supportedProcessorIds || [],
      containerTypesSystemIds: awsp.supportedContainerTypes || [],
    });

    // Add dynamic intents if available
    if (awsp.controlPortsInfo?.dynamicIntents) {
      for (const awspIntent of awsp.controlPortsInfo.dynamicIntents) {
        try {
          const dynamicIntent = new DynamicIntentDefinition({
            intentId: awspIntent.id,
            name: awspIntent.name || `Intent_${awspIntent.id}`,
            maxPort: awspIntent.maxports,
          });
          domainModuleDef.AddDynamicIntentDefinition(dynamicIntent);
        } catch (error) {
          throw new Error(
            `Failed to transform dynamic intent ${awspIntent.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return domainModuleDef;
  }

  /**
   * Static method for building SPF module definitions in worker threads
   * This method is called by the worker registry
   */
  static buildModuleDefinitions(
    input: SpfModuleDefinitionBuildInput,
  ): SpfModuleDefinitionBuildOutput {
    const validModuleDefinitions: DomainSpfModuleDefinition[] = [];
    const errors: Array<{moduleId: number; moduleName: string; error: string}> =
      [];

    for (const awspModuleDef of input.moduleDefinitions) {
      try {
        const domainModuleDef =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModuleDef);
        validModuleDefinitions.push(domainModuleDef);
      } catch (error) {
        // Enhanced error capture with diagnostic information
        const rawErrorMessage =
          error instanceof Error ? error.message : String(error);

        // Ensure we never have empty error messages
        const errorMessage = rawErrorMessage?.trim() || 'Unknown error';

        const diagnosticInfo = {
          moduleId: awspModuleDef.id,
          moduleName: awspModuleDef.name,
          supportedProcessorsCount:
            awspModuleDef.supportedProcessorIds?.length || 0,
          supportedContainersCount:
            awspModuleDef.supportedContainerTypes?.length || 0,
          hasInputPorts: !!awspModuleDef.inputPortsInfo,
          hasOutputPorts: !!awspModuleDef.outputPortsInfo,
          hasControlPorts: !!awspModuleDef.controlPortsInfo,
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        };

        // Create detailed error message with diagnostic context
        const detailedError = `${errorMessage} | Diagnostic: ${JSON.stringify(diagnosticInfo)}`;

        errors.push({
          moduleId: awspModuleDef.id,
          moduleName: awspModuleDef.name,
          error: detailedError,
        });
      }
    }

    return {
      validModuleDefinitions,
      errors,
    };
  }
}
