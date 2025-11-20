import type {BulkKeyDefinitionInsertResult} from '../../../ports/persistence/repositories/bulk-import/key-definition-insertion-report.js';
import type {
  BulkDataLinkInsertResult,
  BulkControlLinkInsertResult,
} from '../../../ports/persistence/repositories/bulk-import/link-insertion-report.js';
import type {BulkEntityInsertResult} from '../../../ports/persistence/repositories/bulk-import/insert-result.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {BulkModuleDefinitionInsertResult} from '../../../ports/persistence/repositories/bulk-import/spf-module-definition-insertion-report.js';
import type {BulkModuleInsertResult} from '../../../ports/persistence/repositories/bulk-import/spf-module-insertion-report.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';

/**
 * Mapper for managing foreign key mappings returned from bulk insertion operations.
 * Maintains mappings between natural keys (keyId, valueId) and generated systemIds.
 * Values are dependent on their parent keys: Map<keySystemId, Map<valueId, systemId>>
 */
export class ForeignKeyMapper {
  private keyDefinitionMappings = new Map<number, number>(); // keyId -> systemId
  private valueDefinitionMappings = new Map<number, Map<number, number>>(); // keySystemId -> Map<valueId, systemId>
  private subgraphMappings = new Map<number, number>(); // subgraphId -> systemId
  private containerMappings = new Map<number, number>(); // containerId -> systemId
  private moduleDefinitionMappings = new Map<number, number>(); // moduleId -> systemId
  private moduleInstanceMappings = new Map<number, number>(); // instanceId -> systemId
  private moduleInputPortMappings = new Map<number, Map<number, number>>(); // moduleSystemId -> Map<portNaturalId, portSystemId>
  private moduleOutputPortMappings = new Map<number, Map<number, number>>(); // moduleSystemId -> Map<portNaturalId, portSystemId>
  private dataLinkMappings = new Map<string, number>(); // naturalKey -> systemId
  private controlLinkMappings = new Map<string, number>(); // naturalKey -> systemId

  constructor(private readonly logger?: Logger) {}

  /**
   * Store key definition mappings from bulk insertion result
   */
  setKeyDefinitionMappings(result: BulkKeyDefinitionInsertResult): void {
    let keyMappingsCount = 0;
    let valueMappingsCount = 0;

    // Process key definition mappings
    for (const keyResult of result.results) {
      if (keyResult.success && keyResult.keyDefinitionIdMapping) {
        const keyId = keyResult.keyDefinitionIdMapping.naturalId;
        const keySystemId = keyResult.keyDefinitionIdMapping.systemId;

        this.keyDefinitionMappings.set(keyId, keySystemId);
        keyMappingsCount++;

        // Process value definition mappings for this key
        if (keyResult.childMappings?.valueDefinitions) {
          const valueMap = new Map<number, number>();

          for (const valueMapping of keyResult.childMappings.valueDefinitions) {
            valueMap.set(valueMapping.naturalId, valueMapping.systemId);
            valueMappingsCount++;
          }

          // Store value mappings under the key's systemId
          this.valueDefinitionMappings.set(keySystemId, valueMap);
        }
      }
    }

    this.logger?.logInfo({
      msg: `Stored foreign key mappings: ${keyMappingsCount} keys, ${valueMappingsCount} values`,
      action: 'foreign_key_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Get systemId for a given keyId
   */
  getKeySystemId(keyId: number): number | undefined {
    return this.keyDefinitionMappings.get(keyId);
  }

  /**
   * Get systemId for a given valueId within the context of a keyId
   */
  getValueSystemId(keyId: number, valueId: number): number | undefined {
    const keySystemId = this.getKeySystemId(keyId);
    if (!keySystemId) {
      return undefined;
    }

    const valueMap = this.valueDefinitionMappings.get(keySystemId);
    return valueMap?.get(valueId);
  }

  /**
   * Check if a keyId has a mapping
   */
  hasKeyMapping(keyId: number): boolean {
    return this.keyDefinitionMappings.has(keyId);
  }

  /**
   * Check if a valueId has a mapping within the context of a keyId
   */
  hasValueMapping(keyId: number, valueId: number): boolean {
    const keySystemId = this.getKeySystemId(keyId);
    if (!keySystemId) {
      return false;
    }

    const valueMap = this.valueDefinitionMappings.get(keySystemId);
    return valueMap?.has(valueId) ?? false;
  }

  /**
   * Get all key mappings
   */
  getAllKeyMappings(): Map<number, number> {
    return new Map(this.keyDefinitionMappings);
  }

  /**
   * Get all value mappings for a specific key
   */
  getValueMappingsForKey(keyId: number): Map<number, number> | undefined {
    const keySystemId = this.getKeySystemId(keyId);
    if (!keySystemId) {
      return undefined;
    }

    const valueMap = this.valueDefinitionMappings.get(keySystemId);
    return valueMap ? new Map(valueMap) : undefined;
  }

  /**
   * Set subgraph mappings from bulk insertion result
   */
  setSubgraphMappings(result: BulkEntityInsertResult): void {
    let mappingsCount = 0;

    for (const entityResult of result.results) {
      if (entityResult.success && entityResult.idMapping) {
        this.subgraphMappings.set(
          entityResult.idMapping.naturalId,
          entityResult.idMapping.systemId,
        );
        mappingsCount++;
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${mappingsCount} subgraph mappings`,
      action: 'subgraph_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set container mappings from bulk insertion result
   */
  setContainerMappings(result: BulkEntityInsertResult): void {
    let mappingsCount = 0;

    for (const entityResult of result.results) {
      if (entityResult.success && entityResult.idMapping) {
        this.containerMappings.set(
          entityResult.idMapping.naturalId,
          entityResult.idMapping.systemId,
        );
        mappingsCount++;
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${mappingsCount} container mappings`,
      action: 'container_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set module definition mappings from bulk insertion result
   */
  setModuleDefinitionMappings(result: BulkModuleDefinitionInsertResult): void {
    let mappingsCount = 0;

    for (const entityResult of result.results) {
      if (entityResult.success && entityResult.definitionIdMapping) {
        this.moduleDefinitionMappings.set(
          entityResult.definitionIdMapping.naturalId,
          entityResult.definitionIdMapping.systemId,
        );
        mappingsCount++;
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${mappingsCount} module definition mappings`,
      action: 'module_definition_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set module instance mappings from bulk insertion result
   */
  setModuleInstanceMappings(result: BulkModuleInsertResult): void {
    let mappingsCount = 0;
    let inputPortMappingsCount = 0;
    let outputPortMappingsCount = 0;

    for (const entityResult of result.results) {
      if (entityResult.success && entityResult.moduleIdMapping) {
        const moduleSystemId = entityResult.moduleIdMapping.systemId;

        // Store module instance mapping
        this.moduleInstanceMappings.set(
          entityResult.moduleIdMapping.naturalId,
          moduleSystemId,
        );
        mappingsCount++;

        // Process data port mappings by type
        if (entityResult.portMappings?.dataPorts) {
          const inputPortMap = new Map<number, number>();
          const outputPortMap = new Map<number, number>();

          for (const portMapping of entityResult.portMappings.dataPorts) {
            if (portMapping.portIoType === PORT_IO_TYPE.Input) {
              inputPortMap.set(portMapping.naturalId, portMapping.systemId);
              inputPortMappingsCount++;
            } else if (portMapping.portIoType === PORT_IO_TYPE.Output) {
              outputPortMap.set(portMapping.naturalId, portMapping.systemId);
              outputPortMappingsCount++;
            }
          }

          // Store port mappings under the module's systemId
          if (inputPortMap.size > 0) {
            this.moduleInputPortMappings.set(moduleSystemId, inputPortMap);
          }
          if (outputPortMap.size > 0) {
            this.moduleOutputPortMappings.set(moduleSystemId, outputPortMap);
          }
        }
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${mappingsCount} module instance mappings, ${inputPortMappingsCount} input ports, ${outputPortMappingsCount} output ports`,
      action: 'module_instance_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Get systemId for a given subgraphId
   */
  getSubgraphSystemId(subgraphId: number): number | undefined {
    return this.subgraphMappings.get(subgraphId);
  }

  /**
   * Get systemId for a given containerId
   */
  getContainerSystemId(containerId: number): number | undefined {
    return this.containerMappings.get(containerId);
  }

  /**
   * Get systemId for a given moduleId (definition)
   */
  getModuleDefinitionSystemId(moduleId: number): number | undefined {
    return this.moduleDefinitionMappings.get(moduleId);
  }

  /**
   * Get systemId for a given module instanceId
   */
  getModuleInstanceSystemId(instanceId: number): number | undefined {
    return this.moduleInstanceMappings.get(instanceId);
  }

  /**
   * Get all input port system IDs for a given module system ID
   */
  getModuleInputPortSystemIds(
    moduleSystemId: number,
  ): Map<number, number> | undefined {
    const portMap = this.moduleInputPortMappings.get(moduleSystemId);
    return portMap ? new Map(portMap) : undefined;
  }

  /**
   * Get all output port system IDs for a given module system ID
   */
  getModuleOutputPortSystemIds(
    moduleSystemId: number,
  ): Map<number, number> | undefined {
    const portMap = this.moduleOutputPortMappings.get(moduleSystemId);
    return portMap ? new Map(portMap) : undefined;
  }

  /**
   * Get system ID for a specific input port of a module
   */
  getInputPortSystemId(
    moduleSystemId: number,
    portNaturalId: number,
  ): number | undefined {
    const portMap = this.moduleInputPortMappings.get(moduleSystemId);
    return portMap?.get(portNaturalId);
  }

  /**
   * Get system ID for a specific output port of a module
   */
  getOutputPortSystemId(
    moduleSystemId: number,
    portNaturalId: number,
  ): number | undefined {
    const portMap = this.moduleOutputPortMappings.get(moduleSystemId);
    return portMap?.get(portNaturalId);
  }

  /**
   * Set data link mappings from bulk insertion result
   */
  setDataLinkMappings(result: BulkDataLinkInsertResult): void {
    for (const linkResult of result.results) {
      if (linkResult.success && linkResult.idMapping) {
        this.dataLinkMappings.set(
          linkResult.idMapping.naturalId,
          linkResult.idMapping.systemId,
        );
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${this.dataLinkMappings.size} data link mappings`,
      action: 'data_link_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set control link mappings from bulk insertion result
   */
  setControlLinkMappings(result: BulkControlLinkInsertResult): void {
    for (const linkResult of result.results) {
      if (linkResult.success && linkResult.idMapping) {
        this.controlLinkMappings.set(
          linkResult.idMapping.naturalId,
          linkResult.idMapping.systemId,
        );
      }
    }

    this.logger?.logInfo({
      msg: `Stored ${this.controlLinkMappings.size} control link mappings`,
      action: 'control_link_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Get systemId for a given data link natural key
   */
  getDataLinkSystemId(naturalKey: string): number | undefined {
    return this.dataLinkMappings.get(naturalKey);
  }

  /**
   * Get systemId for a given control link natural key
   */
  getControlLinkSystemId(naturalKey: string): number | undefined {
    return this.controlLinkMappings.get(naturalKey);
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.keyDefinitionMappings.clear();
    this.valueDefinitionMappings.clear();
    this.subgraphMappings.clear();
    this.containerMappings.clear();
    this.moduleDefinitionMappings.clear();
    this.moduleInstanceMappings.clear();
    this.moduleInputPortMappings.clear();
    this.moduleOutputPortMappings.clear();
    this.dataLinkMappings.clear();
    this.controlLinkMappings.clear();
  }

  /**
   * Get statistics about stored mappings
   */
  getStats(): {
    keyMappings: number;
    valueMappings: number;
    subgraphMappings: number;
    containerMappings: number;
    moduleDefinitionMappings: number;
    moduleInstanceMappings: number;
    moduleInputPortMappings: number;
    moduleOutputPortMappings: number;
    dataLinkMappings: number;
    controlLinkMappings: number;
  } {
    return {
      keyMappings: this.keyDefinitionMappings.size,
      valueMappings: this.valueDefinitionMappings.size,
      subgraphMappings: this.subgraphMappings.size,
      containerMappings: this.containerMappings.size,
      moduleDefinitionMappings: this.moduleDefinitionMappings.size,
      moduleInstanceMappings: this.moduleInstanceMappings.size,
      moduleInputPortMappings: this.moduleInputPortMappings.size,
      moduleOutputPortMappings: this.moduleOutputPortMappings.size,
      dataLinkMappings: this.dataLinkMappings.size,
      controlLinkMappings: this.controlLinkMappings.size,
    };
  }
}
