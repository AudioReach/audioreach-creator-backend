import {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {
  ModuleInstanceInfo,
  ModulePropertyConfig,
} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {PORT_IO_TYPE} from '../../../../../domain/entities/common/enums/port-io-type.js';

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
  async buildSpfModules(
    moduleInstanceInfos: ModuleInstanceInfo[],
    fileSystemId: number,
    modulePropertyConfigs: ModulePropertyConfig[] = [],
  ): Promise<SpfModule[]> {
    // Input validation
    if (!moduleInstanceInfos || moduleInstanceInfos.length === 0) {
      this.logger?.logDebug({
        msg: 'No module instance infos provided for building',
        action: 'no_module_instance_infos',
        component: 'SpfModuleBuilder',
        tag: 'spf-module-building',
        timestamp: new Date(),
      });
      return [];
    }

    // Direct conversion logic
    const spfModules: SpfModule[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const moduleInfo of moduleInstanceInfos) {
      for (const moduleInstance of moduleInfo.moduleInstances) {
        try {
          // Find the specific property config for this module instance
          const modulePropertyConfig = modulePropertyConfigs.find(
            config => config.moduleInstanceId === moduleInstance.instanceId,
          );

          const spfModule = this.convertModuleInstance(
            moduleInstance,
            moduleInfo,
            fileSystemId,
            modulePropertyConfig,
          );
          spfModules.push(spfModule);
          successCount++;
        } catch (error) {
          errorCount++;
          this.logger?.logWarn({
            msg: `Failed to convert module instance ${moduleInstance.instanceId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'spf_module_conversion_failed',
            component: 'SpfModuleBuilder',
            tag: 'spf-module-building',
            timestamp: new Date(),
          });
        }
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} SPF modules successfully, ${errorCount} failed`,
      action: 'spf_module_conversion_complete',
      component: 'SpfModuleBuilder',
      tag: 'spf-module-building',
      timestamp: new Date(),
    });

    return spfModules;
  }

  /**
   * Convert single ModuleInstance to SpfModule entity
   */
  private convertModuleInstance(
    moduleInstance: any,
    moduleInfo: ModuleInstanceInfo,
    fileSystemId: number,
    modulePropertyConfig?: ModulePropertyConfig,
  ): SpfModule {
    // Get foreign key mappings
    const subgraphSystemId = this.getSubgraphSystemId(moduleInfo.subgraphId);
    const containerSystemId = this.getContainerSystemId(moduleInfo.containerId);
    const definitionSystemId = this.getDefinitionSystemId(
      moduleInstance.moduleId,
    );

    if (modulePropertyConfig) {
    }

    // Create data ports using module property config
    const dataPorts = this.createDataPortsFromProperties(modulePropertyConfig);
    const controlPorts = this.createDefaultControlPorts();

    // Create SpfModule entity
    return new SpfModule({
      systemId: 0, // Will be generated during insertion
      instanceId: moduleInstance.instanceId,
      definitionSystemId,
      containerSystemId,
      subgraphSystemId,
      fileSystemId,
      alias: `Module_${moduleInstance.instanceId}`, // Default alias
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
