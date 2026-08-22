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
import {PORT_IO_TYPE} from '../../../../../domain/entities/common/enums/port-io-type.js';
import {DataPortGroupDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/data-port-group-definition.js';
import {DataPortDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/data-port-definition.js';
import {StaticControlPortDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/static-control-port-definition.js';
import {DynamicIntentDefinition} from '../../../../../domain/entities/definitions/spf-module/value-objects/dynamic-intent-definition.js';
import type {BuildResult} from '../../types/issue-collection.js';
import type {Issue} from '../../../../../shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../shared/issues/index.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

/**
 * Natural ID used as a sentinel when a module definition has no supported processors.
 * TODO: Once proper validation is in place, treat missing procIds as a hard upload failure
 * instead of creating a definition with this sentinel value.
 */
const UNKNOWN_PROCESSOR_NATURAL_ID = 0;

/**
 * Input structure for SPF module definition building tasks
 */
export interface SpfModuleDefinitionBuildInput {
  /** Array of AWSP SPF module definitions to transform */
  moduleDefinitions: AwspSpfModuleDefinition[];
  /** Human-readable name for error messages */
  taskName: string;
  /** Set of module IDs that should be loaded at boot-up */
  bootUpModuleIds?: number[];
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
 * Result of transforming a single module definition (may produce multiple entities, one per processor)
 */
interface TransformResult {
  /** One entity per processor, or null if transformation failed */
  entities: SpfModuleDefinition[] | null;
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
   * @param bootUpModuleIds - Set of module IDs that are loaded at boot-up (optional)
   * @returns Promise resolving to BuildResult with entities and issues
   */
  async buildModuleDefinitions(
    awspModuleDefinitions: AwspSpfModuleDefinition[],
    fileSystemId: number,
    bootUpModuleIds?: Set<number>,
  ): Promise<BuildResult<SpfModuleDefinition>> {
    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    this.logger?.logDebug({
      msg: 'spf_module_definition_building_start',
      description: `Building ${awspModuleDefinitions.length} SPF module definitions`,
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
    });

    let result: BuildResult<SpfModuleDefinition>;

    // Determine processing strategy
    const useParallel = this.shouldUseParallel(awspModuleDefinitions);

    try {
      // Step 1: Build entities (systemId = 0) with boot-up flags
      result = await (useParallel
        ? this.buildParallel(awspModuleDefinitions, bootUpModuleIds)
        : this.buildSequential(awspModuleDefinitions, bootUpModuleIds));

      // Step 2: Assign system IDs to all successfully built entities
      if (result.entities.length > 0) {
        await this.assignSystemIds(result.entities, fileSystemId);
      }

      this.logger?.logInfo({
        msg: 'spf_module_definition_building_complete',
        description: `Successfully built ${result.entities.length} SPF module definitions with system IDs assigned, ${result.issues.length} failures`,
        component: 'SpfModuleDefinitionBuilder',
        tag: 'spf-module-definitions',
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'spf_module_definition_building_failed',
        description: 'SPF module definition building failed',
        component: 'SpfModuleDefinitionBuilder',
        tag: 'spf-module-definitions',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Assign system IDs to SPF module definitions and their parameter definitions.
   * Also transforms processor and container type natural IDs to systemIds.
   * Stores foreign key mappings immediately after ID generation.
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

      // IMPORTANT: Extract natural processor ID BEFORE mapping it to system ID
      const processorNaturalId = asNaturalId(moduleDef.processorSystemId);

      // Transform processor definition natural ID to system ID
      this.mapProcessorSystemId(moduleDef);

      // Transform container type natural IDs to system IDs
      this.mapContainerTypeSystemIds(moduleDef);

      // Store module definition mapping using the natural processor ID
      this.foreignKeyMapper.addModuleDefinitionMapping(
        processorNaturalId,
        asNaturalId(moduleDef.moduleDefinitionId),
        asSystemId(moduleDef.systemId),
      );

      // Assign system IDs to parameter definitions and store mappings
      await this.assignParameterSystemIds(moduleDef, fileSystemId);
    }
  }

  /**
   * Assign system IDs to parameter definitions and store mappings
   */
  private async assignParameterSystemIds(
    moduleDef: SpfModuleDefinition,
    fileSystemId: number,
  ): Promise<void> {
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

  /**
   * Map processor natural ID to system ID on the module definition
   */
  private mapProcessorSystemId(moduleDef: SpfModuleDefinition): void {
    const systemId = this.foreignKeyMapper.getProcessorDefinitionSystemId(
      asNaturalId(moduleDef.processorSystemId),
    );
    if (systemId === undefined) {
      this.logger?.logWarn({
        msg: 'processor_mapping_not_found',
        description: `Processor definition ID ${moduleDef.processorSystemId} not found in foreign key mapper for module ${moduleDef.moduleDefinitionId}`,
        component: 'SpfModuleDefinitionBuilder',
        tag: 'spf-module-definitions',
      });
    } else {
      moduleDef.processorSystemId = systemId;
    }
  }

  /**
   * Map container type natural IDs to system IDs
   */
  private mapContainerTypeSystemIds(moduleDef: SpfModuleDefinition): void {
    const containerTypeSystemIds: number[] = [];
    for (const containerTypeNaturalId of moduleDef.containerTypesSystemIds) {
      const systemId = this.foreignKeyMapper.getContainerTypeSystemId(
        asNaturalId(containerTypeNaturalId),
      );
      if (systemId === undefined) {
        this.logger?.logWarn({
          msg: 'container_type_mapping_not_found',
          description: `Container type ID ${containerTypeNaturalId} not found in foreign key mapper for module ${moduleDef.moduleDefinitionId}`,
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
        });
      } else {
        containerTypeSystemIds.push(systemId);
      }
    }
    // Replace the Set with mapped systemIds
    moduleDef.containerTypesSystemIds.clear();
    for (const systemId of containerTypeSystemIds) {
      moduleDef.containerTypesSystemIds.add(systemId);
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
    bootUpModuleIds?: Set<number>,
  ): Promise<BuildResult<SpfModuleDefinition>> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel processing');
    }

    this.logger?.logDebug({
      msg: 'parallel_spf_module_building_start',
      description: `Building ${moduleDefinitions.length} SPF module definitions in parallel (2 tasks)`,
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
    });

    // Split into exactly 2 tasks as requested
    const midpoint = Math.floor(moduleDefinitions.length / 2);
    const task1Definitions = moduleDefinitions.slice(0, midpoint);
    const task2Definitions = moduleDefinitions.slice(midpoint);

    // Convert Set to Array for worker serialization
    const bootUpModuleIdsArray = bootUpModuleIds
      ? [...bootUpModuleIds]
      : undefined;

    const tasks: WorkerTask<SpfModuleDefinitionBuildInput>[] = [];

    // Task 1: First half
    if (task1Definitions.length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.BUILD_SPF_MODULE_DEFINITIONS,
        input: {
          moduleDefinitions: task1Definitions,
          taskName: `SPF module definitions batch 1 (${task1Definitions.length} items)`,
          bootUpModuleIds: bootUpModuleIdsArray,
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
          bootUpModuleIds: bootUpModuleIdsArray,
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
    const issues: Issue[] = [];

    for (const [i, result] of results.entries()) {
      const task = tasks[i];

      if (!result.success || result.error) {
        this.logger?.logError({
          msg: 'parallel_task_failed',
          description: `Failed to build ${task.input.taskName}: ${result.error}`,
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: String(result.error || 'Unknown error'),
        });
        continue;
      }

      const output = result.data as SpfModuleDefinitionBuildOutput;
      validModuleDefinitions.push(...output.validModuleDefinitions);

      // Convert worker errors to Issue format
      for (const error of output.errors) {
        const entityBuildIssue = this.convertToEntityBuildIssue(error.error);
        issues.push(entityBuildIssue);

        this.logger?.logError({
          msg: 'spf_module_definition_transform_error',
          description: `Failed to build SPF module definition ${error.moduleId} (${error.moduleName}): ${error.error}`,
          component: 'SpfModuleDefinitionBuilder',
          tag: 'spf-module-definitions',
          error: String(error.error || 'Unknown error'),
        });
      }
    }

    this.logger?.logInfo({
      msg: 'parallel_spf_module_building_complete',
      description: `Parallel processing completed: ${validModuleDefinitions.length} valid, ${issues.length} errors`,
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
    });

    return {
      entities: validModuleDefinitions,
      issues: issues,
    };
  }

  /**
   * Build SPF module definitions sequentially in the main thread
   * Creates objects with systemId = 0 (to be assigned later)
   */
  private buildSequential(
    moduleDefinitions: AwspSpfModuleDefinition[],
    bootUpModuleIds?: Set<number>,
  ): BuildResult<SpfModuleDefinition> {
    this.logger?.logDebug({
      msg: 'sequential_spf_module_building_start',
      description: `Building ${moduleDefinitions.length} SPF module definitions sequentially`,
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
    });

    const validModuleDefinitions: SpfModuleDefinition[] = [];
    const issues: Issue[] = [];

    for (const awspModuleDef of moduleDefinitions) {
      const isBootUpModule = bootUpModuleIds?.has(awspModuleDef.id) ?? false;
      const result = SpfModuleDefinitionBuilder.transformModuleDefinition(
        awspModuleDef,
        isBootUpModule,
      );

      if (result.entities) {
        // Successfully transformed — one entity per processor
        validModuleDefinitions.push(...result.entities);
      } else {
        // Transformation failed - collect all errors
        for (const error of result.errors) {
          const detailedMessage = `Module ${awspModuleDef.id} (${awspModuleDef.name}): ${error}`;

          // Convert to Issue format
          const entityBuildIssue =
            this.convertToEntityBuildIssue(detailedMessage);
          issues.push(entityBuildIssue);

          this.logger?.logError({
            msg: 'spf_module_definition_transform_error',
            description: `Failed to build SPF module definition ${awspModuleDef.id} (${awspModuleDef.name}): ${error}`,
            component: 'SpfModuleDefinitionBuilder',
            tag: 'spf-module-definitions',
            error: String(error),
          });
        }
      }
    }

    this.logger?.logInfo({
      msg: 'sequential_spf_module_building_complete',
      description: `Sequential processing completed: ${validModuleDefinitions.length} valid, ${issues.length} errors`,
      component: 'SpfModuleDefinitionBuilder',
      tag: 'spf-module-definitions',
    });

    return {
      entities: validModuleDefinitions,
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
        entityType: ISSUE_ENTITY_TYPE.SpfModuleDefinition,
        systemId: 0,
      },
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
      isPersistent: false,
      isReadOnly: false,
      copySrcParamId: awspParam.copySrcParamId,
    });
  }

  /**
   * Transform parameters with error handling
   */
  private static transformParameters(awsp: AwspSpfModuleDefinition): {
    parameters: ParamDefinition[];
    errors: string[];
  } {
    const parameters: ParamDefinition[] = [];
    const errors: string[] = [];

    if (awsp.parameters && Array.isArray(awsp.parameters)) {
      let tempSysId = 0; // Temporary systemId for parameters, to be assigned properly later
      for (const awspParam of awsp.parameters) {
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

    return {parameters, errors};
  }

  /**
   * Create input port group with error handling
   */
  private static createInputPortGroup(awsp: AwspSpfModuleDefinition): {
    portGroup: DataPortGroupDefinition;
    error: string | null;
  } {
    try {
      const portGroup = this.buildInputPortGroup(awsp);
      return {portGroup, error: null};
    } catch (error) {
      const errorMessage = `Input ports: ${error instanceof Error ? error.message : String(error)}`;
      // Create empty group as fallback
      const portGroup = new DataPortGroupDefinition({
        maxAllowedPortCount: 0,
        portIoType: PORT_IO_TYPE.Input,
        staticPortDefinitions: [],
      });
      return {portGroup, error: errorMessage};
    }
  }

  /**
   * Create output port group with error handling
   */
  private static createOutputPortGroup(awsp: AwspSpfModuleDefinition): {
    portGroup: DataPortGroupDefinition;
    error: string | null;
  } {
    try {
      const portGroup = this.buildOutputPortGroup(awsp);
      return {portGroup, error: null};
    } catch (error) {
      const errorMessage = `Output ports: ${error instanceof Error ? error.message : String(error)}`;
      // Create empty group as fallback
      const portGroup = new DataPortGroupDefinition({
        maxAllowedPortCount: 0,
        portIoType: PORT_IO_TYPE.Output,
        staticPortDefinitions: [],
      });
      return {portGroup, error: errorMessage};
    }
  }

  /**
   * Transform static control ports with error handling
   */
  private static transformStaticControlPorts(awsp: AwspSpfModuleDefinition): {
    ports: StaticControlPortDefinition[];
    error: string | null;
  } {
    try {
      const ports = this.buildStaticControlPorts(awsp);
      return {ports, error: null};
    } catch (error) {
      const errorMessage = `Static control ports: ${error instanceof Error ? error.message : String(error)}`;
      return {ports: [], error: errorMessage};
    }
  }

  /**
   * Transform dynamic intents with error handling
   */
  private static transformDynamicIntents(awsp: AwspSpfModuleDefinition): {
    intents: DynamicIntentDefinition[];
    error: string | null;
  } {
    try {
      const intents = this.buildDynamicIntents(awsp);
      return {intents, error: null};
    } catch (error) {
      const errorMessage = `Dynamic intents: ${error instanceof Error ? error.message : String(error)}`;
      return {intents: [], error: errorMessage};
    }
  }

  /**
   * Static method for transforming AWSP SpfModuleDefinition to Domain SpfModuleDefinition.
   * Produces one entity per supported processor ID. If no processors are listed,
   * produces one entity bound to UNKNOWN_PROCESSOR_NATURAL_ID as a sentinel.
   * This method is used both in sequential processing and worker threads.
   * Collects all errors instead of throwing on first error.
   *
   * @param awsp - AWSP module definition to transform
   * @param isLoadedAtBootup - Whether this module is loaded at boot-up
   */
  static transformModuleDefinition(
    awsp: AwspSpfModuleDefinition,
    isLoadedAtBootup = false,
  ): TransformResult {
    const errors: string[] = [];

    // Transform parameters
    const {parameters, errors: paramErrors} = this.transformParameters(awsp);
    errors.push(...paramErrors);

    // Transform input ports
    const {portGroup: inputDataPortsGroup, error: inputError} =
      this.createInputPortGroup(awsp);
    if (inputError) errors.push(inputError);

    // Transform output ports
    const {portGroup: outputDataPortsGroup, error: outputError} =
      this.createOutputPortGroup(awsp);
    if (outputError) errors.push(outputError);

    // Transform static control ports
    const {ports: staticControlPorts, error: controlPortsError} =
      this.transformStaticControlPorts(awsp);
    if (controlPortsError) errors.push(controlPortsError);

    // Transform dynamic intents
    const {intents: dynamicIntents, error: intentsError} =
      this.transformDynamicIntents(awsp);
    if (intentsError) errors.push(intentsError);

    // If any errors occurred, return null entities with all errors
    if (errors.length > 0) {
      return {entities: null, errors};
    }

    // Determine processor IDs — one entity per processor
    // Note: processorSystemId initially holds the NATURAL ID from AWSP;
    // it is mapped to a system ID in assignSystemIds()
    const procIds =
      awsp.processors && awsp.processors.length > 0
        ? awsp.processors
        : [UNKNOWN_PROCESSOR_NATURAL_ID]; // TODO: treat as upload failure once real validation is in place

    const entities: SpfModuleDefinition[] = procIds.map(
      procId =>
        new SpfModuleDefinition({
          systemId: 0, // Placeholder - will be assigned during build process
          moduleDefinitionId: awsp.id,
          fileSystemId: 0, // Placeholder - will be assigned during build process
          name: awsp.name,
          displayName: awsp.displayName || awsp.name,
          description: awsp.description,
          parameters,
          dataPortGroups: [inputDataPortsGroup, outputDataPortsGroup],
          stackSize: 0 /* ToDo Fill correct value from awsp*/,
          staticControlPorts,
          dynamicIntents,
          processorSystemId: procId, // Natural ID — will be mapped to system ID in assignSystemIds()
          containerTypesSystemIds: awsp.containerTypes || [],
          isLoadedAtBootup,
        }),
    );

    return {entities, errors: []};
  }

  private static buildInputPortGroup(
    awsp: AwspSpfModuleDefinition,
  ): DataPortGroupDefinition {
    const staticPortDefinitions: DataPortDefinition[] = [];

    if (awsp.inputPort?.ports) {
      for (const awspPort of awsp.inputPort.ports) {
        try {
          const dataPort = new DataPortDefinition({
            dataPortId: awspPort.id,
            name: awspPort.name || `Port_${awspPort.id}`,
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
      maxAllowedPortCount: awsp.inputPort?.maxPortCount || 0,
      portIoType: PORT_IO_TYPE.Input,
      staticPortDefinitions,
    });
  }

  private static buildOutputPortGroup(
    awsp: AwspSpfModuleDefinition,
  ): DataPortGroupDefinition {
    const staticPortDefinitions: DataPortDefinition[] = [];

    if (awsp.outputPort?.ports) {
      for (const awspPort of awsp.outputPort.ports) {
        try {
          const dataPort = new DataPortDefinition({
            dataPortId: awspPort.id,
            name: awspPort.name || `Port_${awspPort.id}`,
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
      maxAllowedPortCount: awsp.outputPort?.maxPortCount || 0,
      portIoType: PORT_IO_TYPE.Output,
      staticPortDefinitions,
    });
  }

  private static buildStaticControlPorts(
    awsp: AwspSpfModuleDefinition,
  ): StaticControlPortDefinition[] {
    const staticControlPorts: StaticControlPortDefinition[] = [];

    if (!awsp.controlPort?.staticPorts) {
      return staticControlPorts;
    }

    for (const awspPort of awsp.controlPort.staticPorts) {
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

  private static buildDynamicIntents(
    awsp: AwspSpfModuleDefinition,
  ): DynamicIntentDefinition[] {
    if (!awsp.controlPort?.dynamicIntents) {
      return [];
    }

    const dynamicIntents: DynamicIntentDefinition[] = [];
    for (const awspIntent of awsp.controlPort.dynamicIntents) {
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

    // Convert array back to Set for efficient lookup
    const bootUpModuleIds = input.bootUpModuleIds
      ? new Set(input.bootUpModuleIds)
      : undefined;

    for (const awspModuleDef of input.moduleDefinitions) {
      const isBootUpModule = bootUpModuleIds?.has(awspModuleDef.id) ?? false;
      const result = SpfModuleDefinitionBuilder.transformModuleDefinition(
        awspModuleDef,
        isBootUpModule,
      );

      if (result.entities) {
        // Successfully transformed — one entity per processor
        validModuleDefinitions.push(...result.entities);
      } else {
        // Transformation failed - collect all errors with diagnostic information
        const diagnosticInfo = {
          moduleId: awspModuleDef.id,
          moduleName: awspModuleDef.name,
          supportedProcessorsCount: awspModuleDef.processors?.length || 0,
          supportedContainersCount: awspModuleDef.containerTypes?.length || 0,
          hasInputPorts: !!awspModuleDef.inputPort,
          hasOutputPorts: !!awspModuleDef.outputPort,
          hasControlPorts: !!awspModuleDef.controlPort,
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
