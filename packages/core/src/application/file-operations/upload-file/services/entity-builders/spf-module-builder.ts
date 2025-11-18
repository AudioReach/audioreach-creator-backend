import {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {ModuleInstanceInfo} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

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
          const spfModule = this.convertModuleInstance(
            moduleInstance,
            moduleInfo,
            fileSystemId,
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
  ): SpfModule {
    // Get foreign key mappings
    const subgraphSystemId = this.getSubgraphSystemId(moduleInfo.subgraphId);
    const containerSystemId = this.getContainerSystemId(moduleInfo.containerId);
    const definitionSystemId = this.getDefinitionSystemId(
      moduleInstance.moduleId,
    );

    // TODO: Create default ports (these will be enhanced with actual port data later)
    const dataPorts = this.createDefaultDataPorts();
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
   * Create default data ports (will be enhanced with actual port data)
   */
  private createDefaultDataPorts(): DataPort[] {
    // TODO: For now, create empty array - will be populated with actual port data
    return [];
  }

  /**
   * Create default control ports (will be enhanced with actual port data)
   */
  private createDefaultControlPorts(): ControlPort[] {
    // TODO: For now, create empty array - will be populated with actual port data
    return [];
  }
}
