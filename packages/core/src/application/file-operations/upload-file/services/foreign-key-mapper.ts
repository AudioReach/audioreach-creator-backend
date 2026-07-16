/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  PORT_IO_TYPE,
  type PortIoType,
} from '../../../../domain/entities/common/enums/port-io-type.js';
import type {
  NaturalId,
  SystemId,
} from '../../../../shared/types/branded-ids.js';
import {KvHashGenerator} from '../../../../shared/utilities/kv-hash-generator.js';

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
  private moduleDefinitionMappings = new Map<
    NaturalId,
    Map<NaturalId, SystemId>
  >();
  private paramDefinitionMappingsByModuleId = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private driverModuleDefinitionMappings = new Map<NaturalId, SystemId>();
  private driverParamDefinitionMappingsByModuleId = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private vcpmModuleDefinitionMappings = new Map<NaturalId, SystemId>();
  private vcpmParamDefinitionMappingsByModuleId = new Map<
    SystemId,
    Map<NaturalId, SystemId>
  >();
  private driverModuleMappings = new Map<NaturalId, SystemId>();
  private processorDefinitionMappings = new Map<NaturalId, SystemId>();
  private propertyDefinitionMap = new Map<NaturalId, SystemId>();
  private containerTypeMappings = new Map<NaturalId, SystemId>();
  private spfModuleMappings = new Map<NaturalId, SystemId>();
  private subsystemMappings = new Map<NaturalId, SystemId>();
  private moduleInstanceSubgraphMappings = new Map<NaturalId, SystemId>();
  private moduleInstanceToDefinitionMappings = new Map<SystemId, SystemId>();
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
  private tagDefinitionMappings = new Map<NaturalId, SystemId>();

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
   * Add a single processor definition mapping
   */
  addProcessorDefinitionMapping(
    processorDefinitionId: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.processorDefinitionMappings.has(processorDefinitionId)) {
      throw new Error(
        `Processor definition ${processorDefinitionId} already mapped to systemId ${this.processorDefinitionMappings.get(processorDefinitionId)}`,
      );
    }
    this.processorDefinitionMappings.set(processorDefinitionId, systemId);
  }

  /**
   * Get systemId for a given processorDefinitionId
   */
  getProcessorDefinitionSystemId(
    processorDefinitionId: NaturalId,
  ): SystemId | undefined {
    return this.processorDefinitionMappings.get(processorDefinitionId);
  }

  /**
   * Add a single container type mapping
   */
  addContainerTypeMapping(
    containerTypeValue: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.containerTypeMappings.has(containerTypeValue)) {
      throw new Error(
        `Container type ${containerTypeValue} already mapped to systemId ${this.containerTypeMappings.get(containerTypeValue)}`,
      );
    }
    this.containerTypeMappings.set(containerTypeValue, systemId);
  }

  /**
   * Get systemId for a given container type value
   */
  getContainerTypeSystemId(
    containerTypeValue: NaturalId,
  ): SystemId | undefined {
    return this.containerTypeMappings.get(containerTypeValue);
  }

  /**
   * Add a mapping for a subgraph property definition
   */
  addSubgraphPropertyDefinitionMapping(
    naturalId: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.propertyDefinitionMap.has(naturalId)) {
      throw new Error(
        `Subgraph property definition ${naturalId} already mapped to systemId ${this.propertyDefinitionMap.get(naturalId)}`,
      );
    }
    this.propertyDefinitionMap.set(naturalId, systemId);
  }

  /**
   * Get systemId for a given subgraph property definition ID
   */
  getSubgraphPropertyDefinitionSystemId(
    propertyId: NaturalId,
  ): SystemId | undefined {
    return this.propertyDefinitionMap.get(propertyId);
  }

  /**
   * Add a mapping for a container property definition
   */
  addContainerPropertyDefinitionMapping(
    naturalId: NaturalId,
    systemId: SystemId,
  ): void {
    // Container property definitions use the same map as subgraph properties
    // since they share the same property_id space
    if (this.propertyDefinitionMap.has(naturalId)) {
      throw new Error(
        `Container property definition ${naturalId} already mapped to systemId ${this.propertyDefinitionMap.get(naturalId)}`,
      );
    }
    this.propertyDefinitionMap.set(naturalId, systemId);
  }

  /**
   * Get systemId for a given container property definition ID
   */
  getContainerPropertyDefinitionSystemId(
    propertyId: NaturalId,
  ): SystemId | undefined {
    return this.propertyDefinitionMap.get(propertyId);
  }

  /**
   * Add a module definition mapping for a single processor.
   * Each (processorId, moduleDefId) pair maps to a unique systemId.
   */
  addModuleDefinitionMapping(
    processorId: NaturalId,
    moduleDefId: NaturalId,
    systemId: SystemId,
  ): void {
    if (!this.moduleDefinitionMappings.has(processorId)) {
      this.moduleDefinitionMappings.set(processorId, new Map());
    }

    const processorMap = this.moduleDefinitionMappings.get(processorId)!;

    if (processorMap.has(moduleDefId)) {
      throw new Error(
        `Module definition ${moduleDefId} already mapped for processor ${processorId}`,
      );
    }

    processorMap.set(moduleDefId, systemId);
  }

  /**
   * Get systemId for a module definition within a processor context
   */
  getModuleDefinitionSystemId(
    processorId: NaturalId,
    moduleDefId: NaturalId,
  ): SystemId | undefined {
    const processorMap = this.moduleDefinitionMappings.get(processorId);
    return processorMap?.get(moduleDefId);
  }

  /**
   * Get all module definitions for a specific processor
   */
  getModuleDefinitionsForProcessor(
    processorId: NaturalId,
  ): Map<NaturalId, SystemId> | undefined {
    const processorMap = this.moduleDefinitionMappings.get(processorId);
    return processorMap ? new Map(processorMap) : undefined;
  }

  /**
   * Check if a module definition exists for a processor
   */
  hasModuleDefinitionMapping(
    processorId: NaturalId,
    moduleDefId: NaturalId,
  ): boolean {
    return (
      this.moduleDefinitionMappings.get(processorId)?.has(moduleDefId) ?? false
    );
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
   * Add a single driver module definition mapping
   */
  addDriverModuleDefinitionMapping(
    moduleDefinitionId: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.driverModuleDefinitionMappings.has(moduleDefinitionId)) {
      throw new Error(
        `Driver module definition ${moduleDefinitionId} already mapped to systemId ${this.driverModuleDefinitionMappings.get(moduleDefinitionId)}`,
      );
    }
    this.driverModuleDefinitionMappings.set(moduleDefinitionId, systemId);
  }

  /**
   * Get systemId for a given driver module definition ID
   */
  getDriverModuleDefinitionSystemId(
    moduleDefinitionId: NaturalId,
  ): SystemId | undefined {
    return this.driverModuleDefinitionMappings.get(moduleDefinitionId);
  }

  /**
   * Add param definition mapping for a driver module
   */
  addDriverParamDefinitionMapping(
    driverModuleDefinitionId: SystemId,
    paramId: NaturalId,
    systemId: SystemId,
  ): void {
    if (
      !this.driverParamDefinitionMappingsByModuleId.has(
        driverModuleDefinitionId,
      )
    ) {
      this.driverParamDefinitionMappingsByModuleId.set(
        driverModuleDefinitionId,
        new Map(),
      );
    }

    const moduleParams = this.driverParamDefinitionMappingsByModuleId.get(
      driverModuleDefinitionId,
    )!;

    if (moduleParams.has(paramId)) {
      throw new Error(
        `Driver param ${paramId} already mapped for module ${driverModuleDefinitionId}`,
      );
    }

    moduleParams.set(paramId, systemId);
  }

  /**
   * Get driver param definition systemId
   */
  getDriverParamDefinitionSystemId(
    driverModuleDefinitionId: SystemId,
    paramId: NaturalId,
  ): SystemId | undefined {
    return this.driverParamDefinitionMappingsByModuleId
      .get(driverModuleDefinitionId)
      ?.get(paramId);
  }

  /**
   * Add a VCPM module definition mapping
   */
  addVcpmModuleDefinitionMapping(
    moduleDefinitionId: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.vcpmModuleDefinitionMappings.has(moduleDefinitionId)) {
      throw new Error(
        `VCPM module definition ${moduleDefinitionId} already mapped to systemId ${this.vcpmModuleDefinitionMappings.get(moduleDefinitionId)}`,
      );
    }
    this.vcpmModuleDefinitionMappings.set(moduleDefinitionId, systemId);
  }

  /**
   * Get systemId for a given VCPM module definition ID
   */
  getVcpmModuleDefinitionSystemId(
    moduleDefinitionId: NaturalId,
  ): SystemId | undefined {
    return this.vcpmModuleDefinitionMappings.get(moduleDefinitionId);
  }

  /**
   * Add param definition mapping for a VCPM module
   */
  addVcpmParamDefinitionMapping(
    vcpmModuleDefinitionId: SystemId,
    paramId: NaturalId,
    systemId: SystemId,
  ): void {
    if (
      !this.vcpmParamDefinitionMappingsByModuleId.has(vcpmModuleDefinitionId)
    ) {
      this.vcpmParamDefinitionMappingsByModuleId.set(
        vcpmModuleDefinitionId,
        new Map(),
      );
    }

    const moduleParams = this.vcpmParamDefinitionMappingsByModuleId.get(
      vcpmModuleDefinitionId,
    )!;

    if (moduleParams.has(paramId)) {
      throw new Error(
        `VCPM param ${paramId} already mapped for module ${vcpmModuleDefinitionId}`,
      );
    }

    moduleParams.set(paramId, systemId);
  }

  /**
   * Get VCPM param definition systemId
   */
  getVcpmParamDefinitionSystemId(
    vcpmModuleDefinitionId: SystemId,
    paramId: NaturalId,
  ): SystemId | undefined {
    return this.vcpmParamDefinitionMappingsByModuleId
      .get(vcpmModuleDefinitionId)
      ?.get(paramId);
  }

  /**
   * Add a single driver module mapping
   */
  addDriverModuleMapping(
    moduleDefinitionId: NaturalId,
    systemId: SystemId,
  ): void {
    if (this.driverModuleMappings.has(moduleDefinitionId)) {
      throw new Error(
        `Driver module ${moduleDefinitionId} already mapped to systemId ${this.driverModuleMappings.get(moduleDefinitionId)}`,
      );
    }
    this.driverModuleMappings.set(moduleDefinitionId, systemId);
  }

  /**
   * Get systemId for a given driver module (by moduleDefinitionId)
   */
  getDriverModuleSystemId(moduleDefinitionId: NaturalId): SystemId | undefined {
    return this.driverModuleMappings.get(moduleDefinitionId);
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

  addSubsystemMapping(subsystemId: NaturalId, systemId: SystemId): void {
    if (this.subsystemMappings.has(subsystemId)) {
      throw new Error(
        `Subsystem ${subsystemId} already mapped to systemId ${this.subsystemMappings.get(subsystemId)}`,
      );
    }
    this.subsystemMappings.set(subsystemId, systemId);
  }

  getSubsystemSystemId(subsystemId: NaturalId): SystemId | undefined {
    return this.subsystemMappings.get(subsystemId);
  }

  addModuleInstanceSubgraphMapping(
    instanceId: NaturalId,
    subgraphSystemId: SystemId,
  ): void {
    this.moduleInstanceSubgraphMappings.set(instanceId, subgraphSystemId);
  }

  getSubgraphSystemIdForModuleInstance(
    instanceId: NaturalId,
  ): SystemId | undefined {
    return this.moduleInstanceSubgraphMappings.get(instanceId);
  }

  /**
   * Add mapping from module instance system ID to module definition system ID
   */
  addModuleInstanceToDefinitionMapping(
    moduleInstanceSystemId: SystemId,
    moduleDefinitionSystemId: SystemId,
  ): void {
    if (this.moduleInstanceToDefinitionMappings.has(moduleInstanceSystemId)) {
      throw new Error(
        `Module instance ${moduleInstanceSystemId} already mapped to definition ${this.moduleInstanceToDefinitionMappings.get(moduleInstanceSystemId)}`,
      );
    }
    this.moduleInstanceToDefinitionMappings.set(
      moduleInstanceSystemId,
      moduleDefinitionSystemId,
    );
  }

  /**
   * Get module definition system ID from module instance system ID
   */
  getModuleDefinitionSystemIdFromInstance(
    moduleInstanceSystemId: SystemId,
  ): SystemId | undefined {
    return this.moduleInstanceToDefinitionMappings.get(moduleInstanceSystemId);
  }

  /**
   * Add a data port mapping for a module
   */
  addDataPortMapping(
    moduleSystemId: SystemId,
    portNaturalId: NaturalId,
    portSystemId: SystemId,
    portIoType: PortIoType,
  ): void {
    if (portIoType === PORT_IO_TYPE.Input) {
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
   * Add a single tag definition mapping
   */
  addTagDefinitionMapping(tagId: NaturalId, systemId: SystemId): void {
    if (this.tagDefinitionMappings.has(tagId)) {
      throw new Error(
        `Tag definition ${tagId} already mapped to systemId ${this.tagDefinitionMappings.get(tagId)}`,
      );
    }
    this.tagDefinitionMappings.set(tagId, systemId);
  }

  /**
   * Get systemId for a given tagId
   */
  getTagDefinitionSystemId(tagId: NaturalId): SystemId | undefined {
    return this.tagDefinitionMappings.get(tagId);
  }

  /**
   * Get hash for a KeyVector (for deduplication checks).
   *
   * @param valueSystemIds - Array of value systemIds
   * @returns SHA-256 hash string
   */
  getKeyVectorHash(valueSystemIds: number[]): string {
    return KvHashGenerator.generateHash(valueSystemIds);
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
    this.processorDefinitionMappings.clear();
    this.containerTypeMappings.clear();
    this.propertyDefinitionMap.clear();
    this.spfModuleMappings.clear();
    this.moduleInstanceSubgraphMappings.clear();
    this.moduleInstanceToDefinitionMappings.clear();
    this.moduleInputPortMappings.clear();
    this.moduleOutputPortMappings.clear();
    this.moduleControlPortMappings.clear();
    this.dataLinkMappings.clear();
    this.controlLinkMappings.clear();
    this.tagDefinitionMappings.clear();
  }

  /**
   * Get statistics about stored mappings
   */
  getStats(): {
    keyMappings: number;
    valueMappings: number;
    subgraphMappings: number;
    containerMappings: number;
    propertyDefinitionMappings: number;
    moduleDefinitionMappings: number;
    paramDefinitionMappingsByModuleId: number;
    processorDefinitionMappings: number;
    containerTypeMappings: number;
    spfModuleMappings: number;
    moduleInstanceToDefinitionMappings: number;
    moduleInputPortMappings: number;
    moduleOutputPortMappings: number;
    moduleControlPortMappings: number;
    dataLinkMappings: number;
    controlLinkMappings: number;
    tagDefinitionMappings: number;
  } {
    // Count total module definitions across all processors
    let totalModuleDefinitions = 0;
    for (const processorMap of this.moduleDefinitionMappings.values()) {
      totalModuleDefinitions += processorMap.size;
    }

    return {
      keyMappings: this.keyDefinitionMappings.size,
      valueMappings: this.valueDefinitionMappings.size,
      subgraphMappings: this.subgraphMappings.size,
      containerMappings: this.containerMappings.size,
      propertyDefinitionMappings: this.propertyDefinitionMap.size,
      moduleDefinitionMappings: totalModuleDefinitions,
      paramDefinitionMappingsByModuleId:
        this.paramDefinitionMappingsByModuleId.size,
      processorDefinitionMappings: this.processorDefinitionMappings.size,
      containerTypeMappings: this.containerTypeMappings.size,
      spfModuleMappings: this.spfModuleMappings.size,
      moduleInstanceToDefinitionMappings:
        this.moduleInstanceToDefinitionMappings.size,
      moduleInputPortMappings: this.moduleInputPortMappings.size,
      moduleOutputPortMappings: this.moduleOutputPortMappings.size,
      moduleControlPortMappings: this.moduleControlPortMappings.size,
      dataLinkMappings: this.dataLinkMappings.size,
      controlLinkMappings: this.controlLinkMappings.size,
      tagDefinitionMappings: this.tagDefinitionMappings.size,
    };
  }
}
