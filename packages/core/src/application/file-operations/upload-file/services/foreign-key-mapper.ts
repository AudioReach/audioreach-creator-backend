/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  NaturalId,
  SystemId,
} from '../../../../shared/types/branded-ids.js';

/**
 * Mapper for managing foreign key mappings returned from bulk insertion operations.
 * Maintains mappings between natural keys (keyId, valueId) and generated systemIds.
 * Values are dependent on their parent keys: Map<keySystemId, Map<valueId, systemId>>
 */
export class ForeignKeyMapper {
  private keyDefinitionMappings = new Map<NaturalId, SystemId>();
  private valueDefinitionMappings = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private subgraphMappings = new Map<NaturalId, SystemId>();
  private containerMappings = new Map<NaturalId, SystemId>();
  private moduleDefinitionMappings = new Map<NaturalId, SystemId>();
  private paramDefinitionMappingsByModuleId = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private spfModuleMappings = new Map<NaturalId, SystemId>();
  private moduleInputPortMappings = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private moduleOutputPortMappings = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private moduleControlPortMappings = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private dataLinkMappings = new Map<string, SystemId>();
  private controlLinkMappings = new Map<string, SystemId>();

  constructor() {}

  /**
   * Add a single key definition mapping
   */
  addKeyDefinitionMapping(keyId: NaturalId, systemId: SystemId): void {
    if (this.keyDefinitionMappings.has(keyId)) {
      throw new Error(
        `Key definition ${keyId} already mapped to systemId ${this.keyDefinitionMappings.get(keyId)}`,
      );
    }
    this.keyDefinitionMappings.set(keyId, systemId);
  }

  /**
   * Add a single value definition mapping
   */
  addValueDefinitionMapping(
    keyId: NaturalId,
    valueId: NaturalId,
    systemId: SystemId,
  ): void {
    const keySystemId = this.getKeySystemId(keyId);
    if (!keySystemId) {
      throw new Error(`Cannot add value mapping: key ${keyId} not found`);
    }

    let valueMap = this.valueDefinitionMappings.get(keySystemId);
    if (!valueMap) {
      valueMap = new Map<NaturalId, SystemId>();
      this.valueDefinitionMappings.set(keySystemId, valueMap);
    }

    if (valueMap.has(valueId)) {
      throw new Error(
        `Value ${valueId} already mapped for key ${keyId} (keySystemId: ${keySystemId})`,
      );
    }

    valueMap.set(valueId, systemId);
  }

  /*
   // Store key definition mappings from bulk insertion result

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
  }*/

  /**
   * Get systemId for a given keyId
   */
  getKeySystemId(keyId: NaturalId): SystemId | undefined {
    return this.keyDefinitionMappings.get(keyId);
  }

  /**
   * Get systemId for a given valueId within the context of a keyId
   */
  getValueSystemId(keyId: NaturalId, valueId: NaturalId): SystemId | undefined {
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
  hasKeyMapping(keyId: NaturalId): boolean {
    return this.keyDefinitionMappings.has(keyId);
  }

  /**
   * Check if a valueId has a mapping within the context of a keyId
   */
  hasValueMapping(keyId: NaturalId, valueId: NaturalId): boolean {
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
  getAllKeyMappings(): Map<NaturalId, SystemId> {
    return new Map(this.keyDefinitionMappings);
  }

  /**
   * Get all value mappings for a specific key
   */
  getValueMappingsForKey(
    keyId: NaturalId,
  ): Map<NaturalId, SystemId> | undefined {
    const keySystemId = this.getKeySystemId(keyId);
    if (!keySystemId) {
      return undefined;
    }

    const valueMap = this.valueDefinitionMappings.get(keySystemId);
    return valueMap ? new Map(valueMap) : undefined;
  }

  /**
   * Add a single subgraph mapping
   */
  addSubgraphMapping(subgraphId: NaturalId, systemId: SystemId): void {
    if (this.subgraphMappings.has(subgraphId)) {
      throw new Error(
        `Subgraph ${subgraphId} already mapped to systemId ${this.subgraphMappings.get(subgraphId)}`,
      );
    }
    this.subgraphMappings.set(subgraphId, systemId);
  }

  /**
   * Get systemId for a given subgraphId
   */
  getSubgraphSystemId(subgraphId: NaturalId): SystemId | undefined {
    return this.subgraphMappings.get(subgraphId);
  }

  /**
   * Add a single container mapping
   */
  addContainerMapping(containerId: NaturalId, systemId: SystemId): void {
    if (this.containerMappings.has(containerId)) {
      throw new Error(
        `Container ${containerId} already mapped to systemId ${this.containerMappings.get(containerId)}`,
      );
    }
    this.containerMappings.set(containerId, systemId);
  }

  /**
   * Get systemId for a given containerId
   */
  getContainerSystemId(containerId: NaturalId): SystemId | undefined {
    return this.containerMappings.get(containerId);
  }

  /**
   * Add a single module definition mapping
   */
  addModuleDefinitionMapping(moduleId: NaturalId, systemId: SystemId): void {
    if (this.moduleDefinitionMappings.has(moduleId)) {
      throw new Error(
        `Module definition ${moduleId} already mapped to systemId ${this.moduleDefinitionMappings.get(moduleId)}`,
      );
    }
    this.moduleDefinitionMappings.set(moduleId, systemId);
  }

  /**
   * Get systemId for a given moduleId (definition)
   */
  getModuleDefinitionSystemId(moduleId: NaturalId): SystemId | undefined {
    return this.moduleDefinitionMappings.get(moduleId);
  }

  /**
   * Add param definition mapping for a module
   */
  addParamDefinitionMapping(
    moduleDefinitionId: SystemId,
    paramId: NaturalId,
    systemId: SystemId,
  ): void {
    if (!this.paramDefinitionMappingsByModuleId.has(moduleDefinitionId)) {
      this.paramDefinitionMappingsByModuleId.set(moduleDefinitionId, new Map());
    }

    const moduleParams =
      this.paramDefinitionMappingsByModuleId.get(moduleDefinitionId)!;

    if (moduleParams.has(paramId)) {
      throw new Error(
        `Param ${paramId} already mapped for module ${moduleDefinitionId}`,
      );
    }

    moduleParams.set(paramId, systemId);
  }

  /**
   * Get param definition systemId
   */
  getParamDefinitionSystemId(
    moduleDefinitionId: SystemId,
    paramId: NaturalId,
  ): SystemId | undefined {
    return this.paramDefinitionMappingsByModuleId
      .get(moduleDefinitionId)
      ?.get(paramId);
  }

  /**
   * Get all param systemIds for a module
   */
  getModuleParamSystemIds(moduleDefinitionId: SystemId): SystemId[] {
    const moduleParams =
      this.paramDefinitionMappingsByModuleId.get(moduleDefinitionId);
    return moduleParams ? [...moduleParams.values()] : [];
  }

  /**
   * Add a single SPF module mapping
   */
  addSpfModuleMapping(instanceId: NaturalId, systemId: SystemId): void {
    if (this.spfModuleMappings.has(instanceId)) {
      throw new Error(
        `SPF module ${instanceId} already mapped to systemId ${this.spfModuleMappings.get(instanceId)}`,
      );
    }
    this.spfModuleMappings.set(instanceId, systemId);
  }

  /**
   * Get systemId for a given module instanceId
   */
  getSpfModuleSystemId(instanceId: NaturalId): SystemId | undefined {
    return this.spfModuleMappings.get(instanceId);
  }

  /**
   * Add a data port mapping for a module
   */
  addDataPortMapping(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
    portSystemId: SystemId,
    portIoType: 'Input' | 'Output',
  ): void {
    if (portIoType === 'Input') {
      if (!this.moduleInputPortMappings.has(moduleSystemId)) {
        this.moduleInputPortMappings.set(moduleSystemId, new Map());
      }
      const portMap = this.moduleInputPortMappings.get(moduleSystemId)!;
      if (portMap.has(portNaturalId)) {
        throw new Error(
          `Input port ${portNaturalId} already mapped for module ${moduleSystemId}`,
        );
      }
      portMap.set(portNaturalId, portSystemId);
    } else {
      if (!this.moduleOutputPortMappings.has(moduleSystemId)) {
        this.moduleOutputPortMappings.set(moduleSystemId, new Map());
      }
      const portMap = this.moduleOutputPortMappings.get(moduleSystemId)!;
      if (portMap.has(portNaturalId)) {
        throw new Error(
          `Output port ${portNaturalId} already mapped for module ${moduleSystemId}`,
        );
      }
      portMap.set(portNaturalId, portSystemId);
    }
  }

  /**
   * Add a control port mapping for a module
   */
  addControlPortMapping(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
    portSystemId: SystemId,
  ): void {
    if (!this.moduleControlPortMappings.has(moduleSystemId)) {
      this.moduleControlPortMappings.set(moduleSystemId, new Map());
    }
    const portMap = this.moduleControlPortMappings.get(moduleSystemId)!;
    if (portMap.has(portNaturalId)) {
      throw new Error(
        `Control port ${portNaturalId} already mapped for module ${moduleSystemId}`,
      );
    }
    portMap.set(portNaturalId, portSystemId);
  }

  /**
   * Get all input port system IDs for a given module system ID
   */
  getModuleInputPortSystemIds(
    moduleSystemId: SystemId,
  ): Map<NaturalId, SystemId> | undefined {
    const portMap = this.moduleInputPortMappings.get(moduleSystemId);
    return portMap ? new Map(portMap) : undefined;
  }

  /**
   * Get all output port system IDs for a given module system ID
   */
  getModuleOutputPortSystemIds(
    moduleSystemId: SystemId,
  ): Map<NaturalId, SystemId> | undefined {
    const portMap = this.moduleOutputPortMappings.get(moduleSystemId);
    return portMap ? new Map(portMap) : undefined;
  }

  /**
   * Get system ID for a specific input port of a module
   */
  getInputPortSystemId(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
  ): SystemId | undefined {
    const portMap = this.moduleInputPortMappings.get(moduleSystemId);
    return portMap?.get(portNaturalId);
  }

  /**
   * Get system ID for a specific output port of a module
   */
  getOutputPortSystemId(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
  ): SystemId | undefined {
    const portMap = this.moduleOutputPortMappings.get(moduleSystemId);
    return portMap?.get(portNaturalId);
  }

  /**
   * Get all control port system IDs for a given module system ID
   */
  getModuleControlPortSystemIds(
    moduleSystemId: SystemId,
  ): Map<NaturalId, SystemId> | undefined {
    const portMap = this.moduleControlPortMappings.get(moduleSystemId);
    return portMap ? new Map(portMap) : undefined;
  }

  /**
   * Get system ID for a specific control port of a module
   */
  getControlPortSystemId(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
  ): SystemId | undefined {
    const portMap = this.moduleControlPortMappings.get(moduleSystemId);
    return portMap?.get(portNaturalId);
  }

  /**
   * Add a data link mapping keyed by natural IDs
   */
  addDataLinkMapping(
    sourceInstanceId: number,
    sourcePortId: number,
    destinationInstanceId: number,
    destinationPortId: number,
    systemId: SystemId,
  ): void {
    this.dataLinkMappings.set(
      this.buildDataLinkKey(
        sourceInstanceId,
        sourcePortId,
        destinationInstanceId,
        destinationPortId,
      ),
      systemId,
    );
  }

  /**
   * Get systemId for a data link identified by its natural IDs
   */
  getDataLinkSystemId(
    sourceInstanceId: number,
    sourcePortId: number,
    destinationInstanceId: number,
    destinationPortId: number,
  ): SystemId | undefined {
    return this.dataLinkMappings.get(
      this.buildDataLinkKey(
        sourceInstanceId,
        sourcePortId,
        destinationInstanceId,
        destinationPortId,
      ),
    );
  }

  private buildDataLinkKey(
    sourceInstanceId: number,
    sourcePortId: number,
    destinationInstanceId: number,
    destinationPortId: number,
  ): string {
    return `${sourceInstanceId}:${sourcePortId}->${destinationInstanceId}:${destinationPortId}`;
  }

  /**
   * Get systemId for a given control link natural key
   */
  getControlLinkSystemId(naturalKey: string): SystemId | undefined {
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
    this.paramDefinitionMappingsByModuleId.clear();
    this.spfModuleMappings.clear();
    this.moduleInputPortMappings.clear();
    this.moduleOutputPortMappings.clear();
    this.moduleControlPortMappings.clear();
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
    paramDefinitionMappingsByModuleId: number;
    spfModuleMappings: number;
    moduleInputPortMappings: number;
    moduleOutputPortMappings: number;
    moduleControlPortMappings: number;
    dataLinkMappings: number;
    controlLinkMappings: number;
  } {
    return {
      keyMappings: this.keyDefinitionMappings.size,
      valueMappings: this.valueDefinitionMappings.size,
      subgraphMappings: this.subgraphMappings.size,
      containerMappings: this.containerMappings.size,
      moduleDefinitionMappings: this.moduleDefinitionMappings.size,
      paramDefinitionMappingsByModuleId:
        this.paramDefinitionMappingsByModuleId.size,
      spfModuleMappings: this.spfModuleMappings.size,
      moduleInputPortMappings: this.moduleInputPortMappings.size,
      moduleOutputPortMappings: this.moduleOutputPortMappings.size,
      moduleControlPortMappings: this.moduleControlPortMappings.size,
      dataLinkMappings: this.dataLinkMappings.size,
      controlLinkMappings: this.controlLinkMappings.size,
    };
  }
}
