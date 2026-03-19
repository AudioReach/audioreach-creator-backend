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
import {PORT_IO_TYPE} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {SpfModuleDefinition} from 'application/file-operations/shared/awsp-serializers/v1/definitions/index.js';

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
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build SpfModule entities from module instance info
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  buildSpfModules(
    spfModuleInfos: SpfModuleInfo[],
    fileSystemId: number,
    modulePropertyConfigs: ModulePropertyConfig[] = [],
    spfModuleDefinitions: SpfModuleDefinition[] = [],
    dynamicControlPortInfo?: DynamicControlPortInfo,
  ): SpfModule[] {
    // Input validation
    if (!spfModuleInfos || spfModuleInfos.length === 0) {
      return [];
    }

    const moduleDisplayNames =
      this.buildDisplayNameLookup(spfModuleDefinitions);
    const {spfModules, successCount, errorCount} = this.convertSpfModuleInfos(
      spfModuleInfos,
      fileSystemId,
      modulePropertyConfigs,
      moduleDisplayNames,
      spfModuleDefinitions,
      dynamicControlPortInfo,
    );

    this.logConversionComplete(successCount, errorCount);
    return spfModules;
  }

  private buildDisplayNameLookup(
    spfModuleDefinitions: SpfModuleDefinition[],
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

  private convertSpfModuleInfos(
    spfModuleInfos: SpfModuleInfo[],
    fileSystemId: number,
    modulePropertyConfigs: ModulePropertyConfig[],
    moduleDisplayNames: Map<number, string>,
    spfModuleDefinitions: SpfModuleDefinition[],
    dynamicControlPortInfo?: DynamicControlPortInfo,
  ): {spfModules: SpfModule[]; successCount: number; errorCount: number} {
    const spfModules: SpfModule[] = [];
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
            modulePropertyConfig,
            moduleDisplayNames,
            moduleDefinition,
            dynamicControlPortInfo,
          );
          spfModules.push(spfModule);
          successCount++;
        } catch (error) {
          errorCount++;
          this.logConversionError(moduleInstance.instanceId, error);
        }
      }
    }

    return {spfModules, successCount, errorCount};
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

  private logConversionComplete(
    successCount: number,
    errorCount: number,
  ): void {
    this.logger?.logInfo({
      msg: `Converted ${successCount} SPF modules successfully, ${errorCount} failed`,
      action: 'spf_module_conversion_complete',
      component: 'SpfModuleBuilder',
      tag: 'spf-module-building',
      timestamp: new Date(),
    });
  }

  /**
   * Convert single ModuleInstance to SpfModule entity
   */
  private convertSpfModuleInstance(
    moduleInstance: SpfModuleInstance,
    moduleInfo: SpfModuleInfo,
    fileSystemId: number,
    modulePropertyConfig?: ModulePropertyConfig,
    moduleDisplayNames?: Map<number, string>,
    moduleDefinition?: SpfModuleDefinition,
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

    // Create data ports using module property config and definition
    const dataPorts = this.createDataPortsFromProperties(
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
    const systemId = this.foreignKeyMapper.getSubgraphSystemId?.(subgraphId);
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
    const systemId = this.foreignKeyMapper.getContainerSystemId?.(containerId);
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
    const systemId =
      this.foreignKeyMapper.getModuleDefinitionSystemId?.(moduleId);
    if (!systemId) {
      throw new Error(
        `No module definition systemId mapping found for moduleId ${moduleId}`,
      );
    }
    return systemId;
  }

  /**
   * Create data ports from module properties and definition.
   * Static ports are created from the module definition, dynamic ports from the property config.
   */
  createDataPortsFromProperties(
    modulePropertyConfig?: ModulePropertyConfig,
    moduleDefinition?: SpfModuleDefinition,
  ): DataPort[] {
    if (!modulePropertyConfig) {
      return [];
    }

    const portInfo = modulePropertyConfig.getPortInfo();

    if (!portInfo) {
      return [];
    }

    const dataPorts: DataPort[] = [];

    // Get static ports from module definition
    const staticInputPorts = moduleDefinition?.inputPortsInfo?.ports || [];
    const staticOutputPorts = moduleDefinition?.outputPortsInfo?.ports || [];

    // Create static input ports with EVEN IDs starting from 2 (2, 4, 6, ...)
    for (const staticPort of staticInputPorts) {
      dataPorts.push(
        new DataPort({
          systemId: 0,
          dataPortId: staticPort.id,
          portIoType: PORT_IO_TYPE.Input,
          isStatic: true,
          name: staticPort.name || `Input_${staticPort.id}`,
        }),
      );
    }

    // Calculate dynamic input port count
    const dynamicInputPortCount =
      portInfo.maxInputPorts - staticInputPorts.length;

    // Create dynamic input ports with EVEN IDs continuing from static ports
    for (let i = 0; i < dynamicInputPortCount; i++) {
      const portId = (staticInputPorts.length + i) * 2 + 2;
      dataPorts.push(
        new DataPort({
          systemId: 0,
          dataPortId: portId,
          portIoType: PORT_IO_TYPE.Input,
          isStatic: false,
          name: `Input_${portId}`,
        }),
      );
    }

    // Create static output ports with ODD IDs starting from 1 (1, 3, 5, ...)
    for (const staticPort of staticOutputPorts) {
      dataPorts.push(
        new DataPort({
          systemId: 0,
          dataPortId: staticPort.id,
          portIoType: PORT_IO_TYPE.Output,
          isStatic: true,
          name: staticPort.name || `Output_${staticPort.id}`,
        }),
      );
    }

    // Calculate dynamic output port count
    const dynamicOutputPortCount =
      portInfo.maxOutputPorts - staticOutputPorts.length;

    // Create dynamic output ports with ODD IDs continuing from static ports
    for (let i = 0; i < dynamicOutputPortCount; i++) {
      const portId = (staticOutputPorts.length + i) * 2 + 1;
      dataPorts.push(
        new DataPort({
          systemId: 0,
          dataPortId: portId,
          portIoType: PORT_IO_TYPE.Output,
          isStatic: false,
          name: `Output_${portId}`,
        }),
      );
    }

    return dataPorts;
  }

  /**
   * Create control ports from module properties and definition.
   * Static ports are created from the module definition.
   * Dynamic ports are created based on actual usage in control links (dense creation from 0x80000000 to max).
   */
  createControlPortsFromProperties(
    instanceId: number,
    moduleDefinition?: SpfModuleDefinition,
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
