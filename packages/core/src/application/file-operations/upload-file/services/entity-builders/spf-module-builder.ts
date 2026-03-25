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
 * Builder for converting SpfModuleInfo data to SpfModule domain entities.
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

          const spfModule = this.convertSpfModuleInstance(
            moduleInstance,
            moduleInfo,
            fileSystemId,
            modulePropertyConfig,
            moduleDisplayNames,
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

    // Create data ports using module property config
    const dataPorts = this.createDataPortsFromProperties(modulePropertyConfig);
    const controlPorts = this.createDefaultControlPorts();

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
   * Create data ports from module properties using the interface API
   */
  createDataPortsFromProperties(
    modulePropertyConfig?: ModulePropertyConfig,
  ): DataPort[] {
    if (!modulePropertyConfig) {
      return [];
    }

    // Use the interface method directly - clean and simple!
    const portInfo = modulePropertyConfig.getPortInfo();

    if (!portInfo) {
      return [];
    }

    const dataPorts: DataPort[] = [];

    // Create input ports with EVEN IDs starting from 2 (2, 4, 6, ...)
    for (let i = 0; i < portInfo.maxInputPorts; i++) {
      const portId = i * 2 + 2;
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

    // Create output ports with ODD IDs starting from 1 (1, 3, 5, ...)
    for (let i = 0; i < portInfo.maxOutputPorts; i++) {
      const portId = i * 2 + 1;
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
   * Create default control ports (will be enhanced with actual port data)
   */
  private createDefaultControlPorts(): ControlPort[] {
    // TODO: For now, create empty array - will be populated with actual port data
    return [];
  }
}
