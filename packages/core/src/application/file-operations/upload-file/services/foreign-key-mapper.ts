import type {BulkKeyDefinitionInsertResult} from '../../../ports/persistence/repositories/bulk-import/key-definition-insertion-report.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';

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
  setSubgraphMappings(
    mappings: Array<{naturalId: number; systemId: number}>,
  ): void {
    for (const mapping of mappings) {
      this.subgraphMappings.set(mapping.naturalId, mapping.systemId);
    }

    this.logger?.logInfo({
      msg: `Stored ${mappings.length} subgraph mappings`,
      action: 'subgraph_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set container mappings from bulk insertion result
   */
  setContainerMappings(
    mappings: Array<{naturalId: number; systemId: number}>,
  ): void {
    for (const mapping of mappings) {
      this.containerMappings.set(mapping.naturalId, mapping.systemId);
    }

    this.logger?.logInfo({
      msg: `Stored ${mappings.length} container mappings`,
      action: 'container_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set module definition mappings from bulk insertion result
   */
  setModuleDefinitionMappings(
    mappings: Array<{naturalId: number; systemId: number}>,
  ): void {
    for (const mapping of mappings) {
      this.moduleDefinitionMappings.set(mapping.naturalId, mapping.systemId);
    }

    this.logger?.logInfo({
      msg: `Stored ${mappings.length} module definition mappings`,
      action: 'module_definition_mappings_stored',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
  }

  /**
   * Set module instance mappings from bulk insertion result
   */
  setModuleInstanceMappings(
    mappings: Array<{naturalId: number; systemId: number}>,
  ): void {
    for (const mapping of mappings) {
      this.moduleInstanceMappings.set(mapping.naturalId, mapping.systemId);
    }

    this.logger?.logInfo({
      msg: `Stored ${mappings.length} module instance mappings`,
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
   * Clear all mappings
   */
  clear(): void {
    this.keyDefinitionMappings.clear();
    this.valueDefinitionMappings.clear();
    this.subgraphMappings.clear();
    this.containerMappings.clear();
    this.moduleDefinitionMappings.clear();
    this.moduleInstanceMappings.clear();

    this.logger?.logDebug({
      msg: 'Cleared all foreign key mappings',
      action: 'foreign_key_mappings_cleared',
      component: 'ForeignKeyMapper',
      tag: 'foreign-key-mapping',
      timestamp: new Date(),
    });
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
  } {
    return {
      keyMappings: this.keyDefinitionMappings.size,
      valueMappings: this.valueDefinitionMappings.size,
      subgraphMappings: this.subgraphMappings.size,
      containerMappings: this.containerMappings.size,
      moduleDefinitionMappings: this.moduleDefinitionMappings.size,
      moduleInstanceMappings: this.moduleInstanceMappings.size,
    };
  }
}
