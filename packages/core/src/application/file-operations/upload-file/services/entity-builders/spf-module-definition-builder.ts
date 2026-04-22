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
import {AwspSpfModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import type {AwspParamDefinition} from '../../../shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';
import type {AwspPidType} from '../../../shared/awsp-serializers/v1/definitions/module-definition/type/pid-type.js';
import type {AwspToolPolicy} from '../../../shared/awsp-serializers/v1/definitions/module-definition/type/tool-policy.js';
import {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import {ParamDefinition} from '../../../../../domain/entities/definitions/common/entities/param-definition.js';
import type {ParamType} from '../../../../../domain/entities/definitions/common/types/param-type.js';
import {PARAM_TYPE} from '../../../../../domain/entities/definitions/common/types/param-type.js';
import type {ToolPolicy} from '../../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {TOOL_POLICY} from '../../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {DataPortGroupDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/data-port-group-definition.js';
import {DataPortDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/data-port-definition.js';
import {StaticControlPortDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/static-control-port-definition.js';
import {DynamicIntentDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/dynamic-intent-definition.js';
import type {
  BuildResult,
  EntityBuildIssue,
} from '../../types/issue-collection.js';
import {ENTITY_TYPES, ISSUE_SEVERITY} from '../../types/issue-collection.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

/**
 * Input structure for SPF module definition building tasks
 */
export interface SpfModuleDefinitionBuildInput {
  /** Array of AWSP SPF module definitions to transform */
  moduleDefinitions: AwspSpfModuleDefinition[];
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Output structure for SPF module definition building tasks
 */
export interface SpfModuleDefinitionBuildOutput {
  /** Successfully transformed SPF module definitions */
  validModuleDefinitions: SpfModuleDefinition[];
  /** Errors encountered during transformation */
  errors: Array<{moduleId: number; moduleName: string; error: string}>;
}

/**
 * Result of transforming a single module definition
 */
interface TransformResult {
  /** The transformed entity, or null if any errors occurred */
  entity: SpfModuleDefinition | null;
  /** Array of error messages encountered during transformation */
  errors: string[];
}

/**
 * Service responsible for building domain SpfModuleDefinition entities from AWSP SpfModuleDefinitions.
 * Supports both parallel and sequential processing with worker pool integration.
 */
export class SpfModuleDefinitionBuilder {
  /**
   * Static mapping for PID types - created once and reused
   */
  private static readonly PID_TYPE_MAPPING: Record<AwspPidType, ParamType> = {
    None: PARAM_TYPE.None,
    Shared: PARAM_TYPE.Shared,
    GlobalShared: PARAM_TYPE.GlobalShared,
  };

  /**
   * Static mapping for tool policies - created once and reused
   */
  private static readonly TOOL_POLICY_MAPPING: Record<
    AwspToolPolicy,
    ToolPolicy
  > = {
    Calibration: TOOL_POLICY.Calibration,
    RTC: TOOL_POLICY.Rtc,
    RTM: TOOL_POLICY.Rtm,
    RTCReadonly: TOOL_POLICY.RtcReadonly,
  };

  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build domain SpfModuleDefinition entities from AWSP SpfModuleDefinitions with system IDs assigned
   * @param awspModuleDefinitions - Array of AWSP SPF module definitions to transform
   * @param fileSystemId - The file system ID to associate with the module definitions
   * @returns Promise resolving to BuildResult with entities and issues
   */
  async buildModuleDefinitions(
    awspModuleDefinitions: AwspSpfModuleDefinition[],
    fileSystemId: number,
  ): Promise<BuildResult<SpfModuleDefinition>> {
    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    this.logger?.logDebug({
      msg: `Building ${awspModuleDefinitions.length} SPF module definitions`,
      action: 'spf_module_definition_building_start',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    let result: BuildResult<SpfModuleDefinition>;

    // Determine processing strategy
    const useParallel = this.shouldUseParallel(awspModuleDefinitions);

    try {
      // Step 1: Build entities (systemId = 0)
      result = await (useParallel
        ? this.buildParallel(awspModuleDefinitions)
        : this.buildSequential(awspModuleDefinitions));

      // Step 2: Assign system IDs to all successfully built entities
      if (result.entities.length > 0) {
        await this.assignSystemIds(result.entities, fileSystemId);
      }

      this.logger?.logInfo({
        msg: `Successfully built ${result.successCount} SPF module definitions with system IDs assigned, ${result.errorCount} failures`,
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
   * Assign system IDs to SPF module definitions and their parameter definitions.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param moduleDefinitions - SPF module definitions with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    moduleDefinitions: SpfModuleDefinition[],
    fileSystemId: number,
  ): Promise<void> {
    for (const moduleDef of moduleDefinitions) {
      // Assign file system ID
      moduleDef.fileSystemId = fileSystemId;

      // Assign system ID to module definition
      moduleDef.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store module definition mapping immediately
      this.foreignKeyMapper.addModuleDefinitionMapping(
        asNaturalId(moduleDef.moduleDefinitionId),
        asSystemId(moduleDef.systemId),
      );

      // Assign system IDs to parameter definitions and store mappings
      for (const paramDef of moduleDef.parameters) {
        paramDef.systemId = await this.idGenerator.getNextId(fileSystemId);

        // Store parameter definition mapping immediately
        this.foreignKeyMapper.addParamDefinitionMapping(
          asSystemId(moduleDef.systemId),
          asNaturalId(paramDef.paramId),
          asSystemId(paramDef.systemId),
        );
      }
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
  ): Promise<BuildResult<SpfModuleDefinition>> {
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

    // Process results and collect valid module definitions and issues
    const validModuleDefinitions: SpfModuleDefinition[] = [];
    const issues: EntityBuildIssue[] = [];

    for (const [i, result] of results.entries()) {
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

      // Convert worker errors to EntityBuildIssue format
      for (const error of output.errors) {
        const entityBuildIssue = this.convertToEntityBuildIssue(error.error);
        issues.push(entityBuildIssue);

        this.logger?.logError({
          msg: `Failed to build SPF module definition ${error.moduleId} (${error.moduleName}): ${error.error}`,
          action: 'spf_module_definition_transform_error',
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: new Error(error.error || 'Unknown error'),
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Parallel processing completed: ${validModuleDefinitions.length} valid, ${issues.length} errors`,
      action: 'parallel_spf_module_building_complete',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    return {
      entities: validModuleDefinitions,
      issues: issues,
      successCount: validModuleDefinitions.length,
      errorCount: issues.length,
      warningCount: 0,
    };
  }

  /**
   * Build SPF module definitions sequentially in the main thread
   * Creates objects with systemId = 0 (to be assigned later)
   */
  private buildSequential(
    moduleDefinitions: AwspSpfModuleDefinition[],
  ): BuildResult<SpfModuleDefinition> {
    this.logger?.logDebug({
      msg: `Building ${moduleDefinitions.length} SPF module definitions sequentially`,
      action: 'sequential_spf_module_building_start',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    const validModuleDefinitions: SpfModuleDefinition[] = [];
    const issues: EntityBuildIssue[] = [];

    for (const awspModuleDef of moduleDefinitions) {
      const result =
        SpfModuleDefinitionBuilder.transformModuleDefinition(awspModuleDef);

      if (result.entity) {
        // Successfully transformed
        validModuleDefinitions.push(result.entity);
      } else {
        // Transformation failed - collect all errors
        for (const error of result.errors) {
          const detailedMessage = `Module ${awspModuleDef.id} (${awspModuleDef.name}): ${error}`;

          // Convert to EntityBuildIssue format
          const entityBuildIssue =
            this.convertToEntityBuildIssue(detailedMessage);
          issues.push(entityBuildIssue);

          this.logger?.logError({
            msg: `Failed to build SPF module definition ${awspModuleDef.id} (${awspModuleDef.name}): ${error}`,
            action: 'spf_module_definition_transform_error',
            component: 'SpfModuleDefinitionBuilder',
            tag: 'spf-module-definitions',
            error: new Error(error),
            timestamp: new Date(),
          });
        }
      }
    }

    this.logger?.logInfo({
      msg: `Sequential processing completed: ${validModuleDefinitions.length} valid, ${issues.length} errors`,
      action: 'sequential_spf_module_building_complete',
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
      timestamp: new Date(),
    });

    return {
      entities: validModuleDefinitions,
      issues: issues,
      successCount: validModuleDefinitions.length,
      errorCount: issues.length,
      warningCount: 0,
    };
  }

  /**
   * Convert builder error to EntityBuildIssue format
   */
  private convertToEntityBuildIssue(message: string): EntityBuildIssue {
    return {
      severity: ISSUE_SEVERITY.ERROR,
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message,
      entityType: ENTITY_TYPES.SPF_MODULE_DEFINITION,
    };
  }

  /**
   * Map array of AWSP ToolPolicies to Domain ToolPolicies
   */
  private static mapToolPolicies(awspPolicies: AwspToolPolicy[]): ToolPolicy[] {
    return awspPolicies.map(policy => this.TOOL_POLICY_MAPPING[policy]);
  }

  /**
   * Transform AWSP ParamDefinition to Domain ParamDefinition
   */
  private static transformParamDefinition(
    awspParam: AwspParamDefinition,
    systemId: number,
  ): ParamDefinition {
    return new ParamDefinition({
      systemId,
      paramId: awspParam.id,
      name: awspParam.name,
      description: awspParam.description,
      maxSize: awspParam.maxSize,
      toolPolicies: this.mapToolPolicies(awspParam.toolPolicies),
      type: this.PID_TYPE_MAPPING[awspParam.pidType],
      elementsStructure: JSON.stringify(awspParam.elements),
    });
  }

  /**
   * Static method for transforming AWSP SpfModuleDefinition to Domain SpfModuleDefinition
   * This method is used both in sequential processing and worker threads
   * Collects all errors instead of throwing on first error
   */
  static transformModuleDefinition(
    awsp: AwspSpfModuleDefinition,
  ): TransformResult {
    const errors: string[] = [];

    // Transform parameters - collect errors instead of throwing
    const parameters: ParamDefinition[] = [];
    if (awsp.paramDefinitions && Array.isArray(awsp.paramDefinitions)) {
      let tempSysId = 0; // Temporary systemId for parameters, to be assigned properly later
      for (const awspParam of awsp.paramDefinitions) {
        try {
          const param = this.transformParamDefinition(awspParam, tempSysId);
          parameters.push(param);
          tempSysId++; // Increment temporary systemId for next parameter
        } catch (error) {
          errors.push(
            `Parameter ${awspParam.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // Transform input ports - collect errors instead of throwing
    let inputDataPortsGroup: DataPortGroupDefinition;
    try {
      inputDataPortsGroup = this.createInputPortGroup(awsp);
    } catch (error) {
      errors.push(
        `Input ports: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Create empty group as fallback
      inputDataPortsGroup = new DataPortGroupDefinition({
        maxAllowedPortCount: 0,
        portIoType: 'Input',
        staticPortDefinitions: [],
      });
    }

    // Transform output ports - collect errors instead of throwing
    let outputDataPortsGroup: DataPortGroupDefinition;
    try {
      outputDataPortsGroup = this.createOutputPortGroup(awsp);
    } catch (error) {
      errors.push(
        `Output ports: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Create empty group as fallback
      outputDataPortsGroup = new DataPortGroupDefinition({
        maxAllowedPortCount: 0,
        portIoType: 'Output',
        staticPortDefinitions: [],
      });
    }

    // Transform static control ports - collect errors instead of throwing
    let staticControlPorts: StaticControlPortDefinition[];
    try {
      staticControlPorts = this.transformStaticControlPorts(awsp);
    } catch (error) {
      errors.push(
        `Static control ports: ${error instanceof Error ? error.message : String(error)}`,
      );
      staticControlPorts = [];
    }

    // Transform dynamic intents - collect errors instead of throwing
    let dynamicIntents: DynamicIntentDefinition[];
    try {
      dynamicIntents = this.transformDynamicIntents(awsp);
    } catch (error) {
      errors.push(
        `Dynamic intents: ${error instanceof Error ? error.message : String(error)}`,
      );
      dynamicIntents = [];
    }

    // If any errors occurred, return null entity with all errors
    if (errors.length > 0) {
      return {
        entity: null,
        errors,
      };
    }

    // Create domain SPF module definition
    const entity = new SpfModuleDefinition({
      systemId: 0, // Placeholder - will be assigned during build process
      moduleDefinitionId: awsp.id,
      fileSystemId: 0, // Placeholder - will be assigned during build process
      name: awsp.name,
      displayName: awsp.displayName || awsp.name,
      description: awsp.description,
      parameters,
      dataPortGroups: [inputDataPortsGroup, outputDataPortsGroup],
      stackSize: 0 /* ToDo Fill correct value from aswp*/,
      staticControlPorts,
      dynamicIntents,
      processorSystemIds: awsp.supportedProcessorIds || [],
      containerTypesSystemIds: awsp.supportedContainerTypes || [],
    });

    return {
      entity,
      errors: [],
    };
  }

  private static createInputPortGroup(
    awsp: AwspSpfModuleDefinition,
  ): DataPortGroupDefinition {
    const staticPortDefinitions: DataPortDefinition[] = [];

    if (awsp.inputPortsInfo?.ports) {
      for (const awspPort of awsp.inputPortsInfo.ports) {
        try {
          const dataPort = new DataPortDefinition({
            dataPortId: awspPort.id,
            dataPortName: awspPort.name || `Port_${awspPort.id}`,
          });
          staticPortDefinitions.push(dataPort);
        } catch (error) {
          throw new Error(
            `Failed to transform input data port ${awspPort.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return new DataPortGroupDefinition({
      maxAllowedPortCount: awsp.inputPortsInfo?.maxPortCount || 0,
      portIoType: 'Input',
      staticPortDefinitions,
    });
  }

  private static createOutputPortGroup(
    awsp: AwspSpfModuleDefinition,
  ): DataPortGroupDefinition {
    const staticPortDefinitions: DataPortDefinition[] = [];

    if (awsp.outputPortsInfo?.ports) {
      for (const awspPort of awsp.outputPortsInfo.ports) {
        try {
          const dataPort = new DataPortDefinition({
            dataPortId: awspPort.id,
            dataPortName: awspPort.name || `Port_${awspPort.id}`,
          });
          staticPortDefinitions.push(dataPort);
        } catch (error) {
          throw new Error(
            `Failed to transform output data port ${awspPort.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return new DataPortGroupDefinition({
      maxAllowedPortCount: awsp.outputPortsInfo?.maxPortCount || 0,
      portIoType: 'Output',
      staticPortDefinitions,
    });
  }

  private static transformStaticControlPorts(
    awsp: AwspSpfModuleDefinition,
  ): StaticControlPortDefinition[] {
    const staticControlPorts: StaticControlPortDefinition[] = [];

    if (!awsp.controlPortsInfo?.staticPorts) {
      return staticControlPorts;
    }

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

    return staticControlPorts;
  }

  private static transformDynamicIntents(
    awsp: AwspSpfModuleDefinition,
  ): DynamicIntentDefinition[] {
    if (!awsp.controlPortsInfo?.dynamicIntents) {
      return [];
    }

    const dynamicIntents: DynamicIntentDefinition[] = [];
    for (const awspIntent of awsp.controlPortsInfo.dynamicIntents) {
      try {
        dynamicIntents.push(
          new DynamicIntentDefinition({
            intentId: awspIntent.id,
            name: awspIntent.name || `Intent_${awspIntent.id}`,
            maxPort: awspIntent.maxports,
          }),
        );
      } catch (error) {
        throw new Error(
          `Failed to transform dynamic intent ${awspIntent.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return dynamicIntents;
  }

  /**
   * Static method for building SPF module definitions in worker threads
   * This method is called by the worker registry
   */
  static buildModuleDefinitions(
    input: SpfModuleDefinitionBuildInput,
  ): SpfModuleDefinitionBuildOutput {
    const validModuleDefinitions: SpfModuleDefinition[] = [];
    const errors: Array<{moduleId: number; moduleName: string; error: string}> =
      [];

    for (const awspModuleDef of input.moduleDefinitions) {
      const result =
        SpfModuleDefinitionBuilder.transformModuleDefinition(awspModuleDef);

      if (result.entity) {
        // Successfully transformed
        validModuleDefinitions.push(result.entity);
      } else {
        // Transformation failed - collect all errors with diagnostic information
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
          errorCount: result.errors.length,
        };

        // Combine all errors into a single detailed message
        const allErrors = result.errors.join('; ');
        const detailedError = `${allErrors} | Diagnostic: ${JSON.stringify(diagnosticInfo)}`;

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
