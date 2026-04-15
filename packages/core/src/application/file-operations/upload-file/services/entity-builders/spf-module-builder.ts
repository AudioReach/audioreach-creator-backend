/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {
  SpfModuleInfo,
  SpfModuleInstance,
  ModulePropertyConfig,
} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {
  PORT_IO_TYPE,
  type PortIoType,
} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {AwspSpfModuleDefinition} from 'application/file-operations/shared/awsp-serializers/v1/definitions/index.js';
import {
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '../../../shared/awsp-serializers/v1/configuration/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import type {
  BuildResult,
  EntityBuildIssue,
} from '../../types/issue-collection.js';
import {ENTITY_TYPES, ISSUE_SEVERITY} from '../../types/issue-collection.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import {CalibrationDataBuilder} from './calibration-data-builder.js';

/**
 * Dynamic control port ID starts from this value
 */
const DYNAMIC_CONTROL_PORT_ID_START = 0x80_00_00_00;

/**
 * Information about dynamic control ports usage per module
 */
export interface DynamicControlPortInfo {
  maxDynamicPortIdPerModule: Map<number, number>;
}

/**
 * Builder for converting ModuleInstanceInfo data to SpfModule domain entities.
 * Handles creation of modules with ports and foreign key mappings.
 */
export class SpfModuleBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build SpfModule entities from module instance info with system IDs assigned
   * Main API method similar to SubgraphBuilder.buildSubgraphs()
   */
  async buildSpfModules(
    spfModuleInfos: SpfModuleInfo[],
    fileSystemId: number,
    portStrategy: ModulePortStrategy,
    modulePropertyConfigs: ModulePropertyConfig[] = [],
    spfModuleDefinitions: AwspSpfModuleDefinition[] = [],
    dynamicControlPortInfo?: DynamicControlPortInfo,
    parsedAcdb?: ParsedAcdb,
  ): Promise<BuildResult<SpfModule>> {
    // Input validation
    if (!spfModuleInfos || spfModuleInfos.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    this.logger?.logInfo({
      msg: `Using port strategy: ${portStrategy}`,
      action: 'port_strategy_selected',
      component: 'SpfModuleBuilder',
      tag: 'spf-module-building',
      timestamp: new Date(),
    });

    // Step 1: Build entities (systemId = 0)
    const moduleDisplayNames =
      this.buildDisplayNameLookup(spfModuleDefinitions);
    const result = this.convertSpfModuleInfos(
      spfModuleInfos,
      fileSystemId,
      portStrategy,
      modulePropertyConfigs,
      moduleDisplayNames,
      spfModuleDefinitions,
      dynamicControlPortInfo,
    );

    // Step 2: Assign system IDs to all successfully built entities
    if (result.entities.length > 0) {
      await this.assignSystemIds(result.entities, fileSystemId);
    }

    // Step 3: Attach calibration data if ACDB provided
    if (parsedAcdb && result.entities.length > 0) {
      await this.attachCalibrationData(
        result.entities,
        parsedAcdb,
        fileSystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${result.successCount} SPF modules with system IDs assigned, ${result.errorCount} failed`,
      action: 'spf_module_building_complete',
      component: 'SpfModuleBuilder',
      tag: 'spf-module-building',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Assign system IDs to SPF modules and their ports.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param spfModules - SPF modules with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    spfModules: SpfModule[],
    fileSystemId: number,
  ): Promise<void> {
    for (const spfModule of spfModules) {
      // Assign system ID to module
      spfModule.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Assign system IDs to data ports
      await this.assignDataPortSystemIds(
        spfModule.dataPorts,
        fileSystemId,
        spfModule.systemId,
      );

      // Assign system IDs to control ports
      await this.assignControlPortSystemIds(
        spfModule.controlPorts,
        fileSystemId,
        spfModule.systemId,
      );

      // Store module mapping immediately
      this.foreignKeyMapper.addSpfModuleMapping(
        asNaturalId(spfModule.instanceId),
        asSystemId(spfModule.systemId),
      );
    }
  }

  /**
   * Assign system IDs to data ports and store mappings
   * Mutates the port objects directly
   */
  private async assignDataPortSystemIds(
    dataPorts: readonly DataPort[],
    fileSystemId: number,
    moduleSystemId: number,
  ): Promise<void> {
    for (const port of dataPorts) {
      // Assign system ID to port
      port.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store port mapping
      this.foreignKeyMapper.addDataPortMapping(
        asSystemId(moduleSystemId),
        asNaturalId(port.dataPortId),
        asSystemId(port.systemId),
        port.portIoType,
      );
    }
  }

  /**
   * Assign system IDs to control ports and store mappings
   * Mutates the port objects directly
   */
  private async assignControlPortSystemIds(
    controlPorts: readonly ControlPort[],
    fileSystemId: number,
    moduleSystemId: number,
  ): Promise<void> {
    for (const port of controlPorts) {
      // Assign system ID to port
      port.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Set nodeSystemId to module's system ID
      port.nodeSystemId = moduleSystemId;

      // Store port mapping
      this.foreignKeyMapper.addControlPortMapping(
        asSystemId(moduleSystemId),
        asNaturalId(port.portId),
        asSystemId(port.systemId),
      );
    }
  }

  /**
   * Attach calibration data to SPF modules.
   * Builds KvData with KeyVector deduplication and attaches them to their respective modules.
   */
  private async attachCalibrationData(
    spfModules: SpfModule[],
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<void> {
    const calibrationBuilder = new CalibrationDataBuilder(
      this.idGenerator,
      this.logger,
    );

    try {
      // Build calibration data grouped by module systemId
      const kvDataByModule =
        await calibrationBuilder.buildCalibrationDataByModule(
          parsedAcdb,
          this.foreignKeyMapper,
          fileSystemId,
        );

      // Attach KvData to their respective modules
      for (const spfModule of spfModules) {
        const moduleKvData = kvDataByModule.get(spfModule.systemId);
        if (moduleKvData) {
          for (const kvData of moduleKvData) {
            spfModule.addModuleCkv(kvData);
          }
        }
      }
    } catch (error) {
      // Log warning but don't fail the entire build
      this.logger?.logWarn({
        msg: `Failed to attach calibration data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'calibration_attachment_failed',
        component: 'SpfModuleBuilder',
        tag: 'calibration-attachment',
        timestamp: new Date(),
      });
    }
  }

  private buildDisplayNameLookup(
    spfModuleDefinitions: AwspSpfModuleDefinition[],
  ): Map<number, string> {
    const moduleDisplayNames = new Map<number, string>();

    if (!spfModuleDefinitions || spfModuleDefinitions.length === 0) {
      return moduleDisplayNames;
    }

    for (const moduleDef of spfModuleDefinitions) {
      const displayName = moduleDef.displayName || moduleDef.name;
      if (displayName) {
        moduleDisplayNames.set(moduleDef.id, displayName);
      }
    }

    return moduleDisplayNames;
  }

  /**
   * Convert SPF module infos sequentially in the main thread
   * Creates objects with systemId = 0 and fileSystemId set (to be assigned later)
   */
  private convertSpfModuleInfos(
    spfModuleInfos: SpfModuleInfo[],
    fileSystemId: number,
    portStrategy: ModulePortStrategy,
    modulePropertyConfigs: ModulePropertyConfig[],
    moduleDisplayNames: Map<number, string>,
    spfModuleDefinitions: AwspSpfModuleDefinition[],
    dynamicControlPortInfo?: DynamicControlPortInfo,
  ): BuildResult<SpfModule> {
    const spfModules: SpfModule[] = [];
    const issues: EntityBuildIssue[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const moduleInfo of spfModuleInfos) {
      for (const moduleInstance of moduleInfo.spfModules) {
        try {
          const modulePropertyConfig = modulePropertyConfigs.find(
            config => config.spfModuleInstanceId === moduleInstance.instanceId,
          );

          // TODO: Get processorId from container property to match with definition's supportedProcessorIds
          const moduleDefinition = spfModuleDefinitions.find(
            def => def.id === moduleInstance.moduleId,
          );

          const spfModule = this.convertSpfModuleInstance(
            moduleInstance,
            moduleInfo,
            fileSystemId,
            portStrategy,
            modulePropertyConfig,
            moduleDisplayNames,
            moduleDefinition,
            dynamicControlPortInfo,
          );
          spfModules.push(spfModule);
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const issue = this.convertToEntityBuildIssue(
            errorMessage,
            moduleInstance.instanceId,
          );
          issues.push(issue);
          this.logConversionError(moduleInstance.instanceId, error);
        }
      }
    }

    return {
      entities: spfModules,
      issues,
      successCount,
      errorCount,
      warningCount: 0,
    };
  }

  private logConversionError(instanceId: number, error: unknown): void {
    this.logger?.logWarn({
      msg: `Failed to convert module instance ${instanceId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      action: 'spf_module_conversion_failed',
      component: 'SpfModuleBuilder',
      tag: 'spf-module-building',
      timestamp: new Date(),
    });
  }

  private convertToEntityBuildIssue(
    errorMessage: string,
    instanceId?: number,
  ): EntityBuildIssue {
    return {
      entityType: ENTITY_TYPES.SPF_MODULE,
      severity: ISSUE_SEVERITY.ERROR,
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message: errorMessage,
      entityData:
        instanceId === undefined ? undefined : `instanceId: ${instanceId}`,
    };
  }

  /**
   * Convert single ModuleInstance to SpfModule entity
   */
  private convertSpfModuleInstance(
    moduleInstance: SpfModuleInstance,
    moduleInfo: SpfModuleInfo,
    fileSystemId: number,
    portStrategy: ModulePortStrategy,
    modulePropertyConfig?: ModulePropertyConfig,
    moduleDisplayNames?: Map<number, string>,
    moduleDefinition?: AwspSpfModuleDefinition,
    dynamicControlPortInfo?: DynamicControlPortInfo,
  ): SpfModule {
    // Get foreign key mappings
    const subgraphSystemId = this.getSubgraphSystemId(moduleInfo.subgraphId);
    const containerSystemId = this.getContainerSystemId(moduleInfo.containerId);
    const definitionSystemId = this.getDefinitionSystemId(
      moduleInstance.moduleId,
    );

    // Module property config is available but not currently used in this conversion
    // It will be utilized when we implement property-based port configuration
    if (modulePropertyConfig) {
      // Intentionally empty - reserved for future property-based configuration
    }

    // Create data ports using module property config, definition, and port strategy
    const dataPorts = this.createDataPortsFromProperties(
      portStrategy,
      modulePropertyConfig,
      moduleDefinition,
    );

    // Create control ports using module definition and dynamic port info
    const controlPorts = this.createControlPortsFromProperties(
      moduleInstance.instanceId,
      moduleDefinition,
      dynamicControlPortInfo,
    );

    // Get display name from module definition, fallback to default alias
    const displayName = moduleDisplayNames?.get(moduleInstance.moduleId);
    const alias = displayName || `Module_${moduleInstance.instanceId}`;

    // Create SpfModule entity
    return new SpfModule({
      systemId: 0, // Will be generated during insertion
      instanceId: moduleInstance.instanceId,
      definitionSystemId,
      containerSystemId,
      subgraphSystemId,
      fileSystemId,
      alias,
      dataPorts,
      controlPorts,
    });
  }

  /**
   * Get subgraph systemId from foreign key mapper
   */
  private getSubgraphSystemId(subgraphId: number): number {
    const systemId = this.foreignKeyMapper.getSubgraphSystemId?.(
      asNaturalId(subgraphId),
    );
    if (!systemId) {
      throw new Error(
        `No subgraph systemId mapping found for subgraphId ${subgraphId}`,
      );
    }
    return systemId;
  }

  /**
   * Get container systemId from foreign key mapper
   */
  private getContainerSystemId(containerId: number): number {
    const systemId = this.foreignKeyMapper.getContainerSystemId?.(
      asNaturalId(containerId),
    );
    if (!systemId) {
      throw new Error(
        `No container systemId mapping found for containerId ${containerId}`,
      );
    }
    return systemId;
  }

  /**
   * Get definition systemId from foreign key mapper
   */
  private getDefinitionSystemId(moduleId: number): number {
    const systemId = this.foreignKeyMapper.getModuleDefinitionSystemId?.(
      asNaturalId(moduleId),
    );
    if (!systemId) {
      throw new Error(
        `No module definition systemId mapping found for moduleId ${moduleId}`,
      );
    }
    return systemId;
  }

  /**
   * Calculate port ID based on the port strategy.
   * @param baseIndex - The base index for the port (0-based)
   * @param isInput - Whether this is an input port
   * @param portStrategy - The port strategy to use
   * @returns The calculated port ID
   */
  private calculatePortId(
    baseIndex: number,
    isInput: boolean,
    portStrategy: ModulePortStrategy,
  ): number {
    switch (portStrategy) {
      case MODULE_PORT_STRATEGIES.INPUT_ODD_OUTPUT_EVEN:
        // Input ports: 1, 3, 5, 7... (odd numbers)
        // Output ports: 2, 4, 6, 8... (even numbers)
        return isInput ? baseIndex * 2 + 1 : baseIndex * 2 + 2;

      case MODULE_PORT_STRATEGIES.SEQUENTIAL:
        // Both input and output ports: 1, 2, 3, 4... (sequential)
        return baseIndex + 1;

      default:
        // Default to INPUT_ODD_OUTPUT_EVEN if unknown strategy
        return isInput ? baseIndex * 2 + 1 : baseIndex * 2 + 2;
    }
  }

  /**
   * Helper method to create static data ports from port definitions.
   * @param ports - Array of static port definitions
   * @param portIoType - The IO type (Input or Output)
   * @returns Array of DataPort entities
   */
  private createStaticPorts(
    ports: Array<{id: number; name?: string}>,
    portIoType: PortIoType,
  ): DataPort[] {
    return ports.map(
      staticPort =>
        new DataPort({
          systemId: 0,
          dataPortId: staticPort.id,
          portIoType,
          isStatic: true,
          name:
            staticPort.name ||
            `${portIoType === PORT_IO_TYPE.Input ? 'Input' : 'Output'}_${staticPort.id}`,
        }),
    );
  }

  /**
   * Helper method to create dynamic data ports with strategy-based port IDs.
   * @param count - Number of dynamic ports to create
   * @param startIndex - Starting index for port ID calculation
   * @param isInput - Whether these are input ports
   * @param portStrategy - The port strategy to use for ID calculation
   * @returns Array of DataPort entities
   */
  private createDynamicPorts(
    count: number,
    startIndex: number,
    isInput: boolean,
    portStrategy: ModulePortStrategy,
  ): DataPort[] {
    const ports: DataPort[] = [];
    const portIoType = isInput ? PORT_IO_TYPE.Input : PORT_IO_TYPE.Output;
    const portTypeLabel = isInput ? 'Input' : 'Output';

    for (let i = 0; i < count; i++) {
      const baseIndex = startIndex + i;
      const portId = this.calculatePortId(baseIndex, isInput, portStrategy);
      ports.push(
        new DataPort({
          systemId: 0,
          dataPortId: portId,
          portIoType,
          isStatic: false,
          name: `${portTypeLabel}_${portId}`,
        }),
      );
    }

    return ports;
  }

  /**
   * Create data ports from module properties and definition.
   * Static ports are created from the module definition, dynamic ports from the property config.
   * Port IDs are calculated based on the port strategy.
   */
  private createDataPortsFromProperties(
    portStrategy: ModulePortStrategy,
    modulePropertyConfig?: ModulePropertyConfig,
    moduleDefinition?: AwspSpfModuleDefinition,
  ): DataPort[] {
    if (!modulePropertyConfig) {
      return [];
    }

    const portInfo = modulePropertyConfig.getPortInfo();

    if (!portInfo) {
      return [];
    }

    // Get static ports from module definition
    const staticInputPorts = moduleDefinition?.inputPortsInfo?.ports ?? [];
    const staticOutputPorts = moduleDefinition?.outputPortsInfo?.ports ?? [];

    // Calculate dynamic port counts
    const dynamicInputPortCount =
      portInfo.maxInputPorts - staticInputPorts.length;
    const dynamicOutputPortCount =
      portInfo.maxOutputPorts - staticOutputPorts.length;

    // Create all ports using helper methods
    return [
      ...this.createStaticPorts(staticInputPorts, PORT_IO_TYPE.Input),
      ...this.createDynamicPorts(
        dynamicInputPortCount,
        staticInputPorts.length,
        true,
        portStrategy,
      ),
      ...this.createStaticPorts(staticOutputPorts, PORT_IO_TYPE.Output),
      ...this.createDynamicPorts(
        dynamicOutputPortCount,
        staticOutputPorts.length,
        false,
        portStrategy,
      ),
    ];
  }

  /**
   * Create control ports from module properties and definition.
   * Static ports are created from the module definition.
   * Dynamic ports are created based on actual usage in control links (dense creation from 0x80000000 to max).
   */
  private createControlPortsFromProperties(
    instanceId: number,
    moduleDefinition?: AwspSpfModuleDefinition,
    dynamicControlPortInfo?: DynamicControlPortInfo,
  ): ControlPort[] {
    const controlPorts: ControlPort[] = [];

    if (!moduleDefinition?.controlPortsInfo) {
      return controlPorts;
    }

    const controlPortsInfo = moduleDefinition.controlPortsInfo;

    // 1. Create ALL STATIC control ports from definition
    // These are added to every module instance
    if (controlPortsInfo.staticPorts) {
      for (const staticPort of controlPortsInfo.staticPorts) {
        // Store intent IDs directly as data
        const intentSystemIds = staticPort.supportedIntents.map(
          intent => intent.id,
        );

        controlPorts.push(
          new ControlPort({
            systemId: 0,
            portId: staticPort.id,
            isStatic: true,
            nodeSystemId: 0, // Will be set after module insertion
            name: staticPort.name || `ControlPort_${staticPort.id}`,
            intentSystemIds,
          }),
        );
      }
    }

    // 2. Create DYNAMIC control ports (dense creation from 0x80000000 to max)
    if (controlPortsInfo.dynamicIntents && dynamicControlPortInfo) {
      const maxDynamicPortId =
        dynamicControlPortInfo.maxDynamicPortIdPerModule.get(instanceId);

      if (
        maxDynamicPortId &&
        maxDynamicPortId >= DYNAMIC_CONTROL_PORT_ID_START
      ) {
        // Calculate number of dynamic ports needed
        const numDynamicPorts =
          maxDynamicPortId - DYNAMIC_CONTROL_PORT_ID_START + 1;

        // All dynamic ports support all dynamic intents
        const dynamicIntentSystemIds = controlPortsInfo.dynamicIntents.map(
          intent => intent.id,
        );

        // Create all ports from 0x80000000 to maxDynamicPortId (dense)
        for (let i = 0; i < numDynamicPorts; i++) {
          const portId = DYNAMIC_CONTROL_PORT_ID_START + i;

          controlPorts.push(
            new ControlPort({
              systemId: 0,
              portId: portId,
              isStatic: false,
              nodeSystemId: 0,
              name: `DynamicControlPort_0x${portId.toString(16)}`, // Hex format
              intentSystemIds: dynamicIntentSystemIds,
            }),
          );
        }

        this.logger?.logDebug({
          msg: `Created ${numDynamicPorts} dynamic control ports for module instance ${instanceId} (0x${DYNAMIC_CONTROL_PORT_ID_START.toString(16)} to 0x${maxDynamicPortId.toString(16)})`,
          action: 'dynamic_control_ports_created',
          component: 'SpfModuleBuilder',
          tag: 'control-port-building',
          timestamp: new Date(),
        });
      }
    }

    return controlPorts;
  }
}
