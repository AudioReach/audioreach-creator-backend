/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {
  ModulePropertyConfig,
  ModuleProperty,
  PortInfo,
  HeapInfo,
} from './types.js';
import {
  MODULE_PROP_ID_PORT_INFO,
  MODULE_PROP_ID_HEAP_ID,
} from '../../constants/spf-ids.js';
import {ModulePropertyConfigImpl} from './module-property-config-impl.js';

/**
 * Handles parsing of module port properties from binary data.
 */
export class ModulePortProperty {
  /** List of module property configurations */
  readonly modulePropertyConfigs: ModulePropertyConfig[] = [];

  private constructor() {}

  /**
   * Create ModulePortProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): ModulePortProperty {
    const instance = new ModulePortProperty();
    instance.parsePayload(payload);
    return instance;
  }

  /**
   * Parse binary payload into module property configurations
   */
  private parsePayload(payload: Uint8Array): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of module property configurations
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'module property config count',
    );
    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each module property configuration
    for (let i = 0; i < count; i++) {
      const result = this.parseModulePropertyConfig(view, payload, pos);
      this.modulePropertyConfigs.push(result.config);
      pos = result.newPos;
    }
  }

  /**
   * Validate that there are enough bytes remaining in the payload
   */
  private validateLength(
    pos: number,
    requiredBytes: number,
    totalLength: number,
    fieldName: string,
  ): void {
    if (pos + requiredBytes > totalLength) {
      throw new Error(`Cannot read ${fieldName} at position ${pos}`);
    }
  }

  /**
   * Parse a single module property configuration
   */
  private parseModulePropertyConfig(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {config: ModulePropertyConfig; newPos: number} {
    let pos = startPos;

    // Read module instance ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'module instance ID',
    );
    const spfModuleInstanceId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse properties for this module
    const result = this.parseModuleProperties(view, payload, pos);
    const properties = result.properties;
    pos = result.newPos;

    // Create module property configuration with implementation
    const config = new ModulePropertyConfigImpl(
      spfModuleInstanceId,
      properties,
    );

    return {config, newPos: pos};
  }

  /**
   * Parse module properties for a module property configuration
   */
  private parseModuleProperties(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {properties: ModuleProperty[]; newPos: number} {
    let pos = startPos;

    // Read property count
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'property count',
    );
    const propCount = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const properties: ModuleProperty[] = [];

    for (let j = 0; j < propCount; j++) {
      const result = this.parseModuleProperty(view, payload, pos);
      properties.push(result.property);
      pos = result.newPos;
    }

    return {properties, newPos: pos};
  }

  /**
   * Parse a single module property
   */
  private parseModuleProperty(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {property: ModuleProperty; newPos: number} {
    let pos = startPos;

    // Read property ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'property ID',
    );
    const propId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read property size
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'property size',
    );
    const propSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read property data
    this.validateLength(pos, propSize, payload.length, 'property data');
    const propData = payload.slice(pos, pos + propSize);
    pos += propSize;

    const property: ModuleProperty = {
      propertyId: propId,
      data: propData,
    };

    return {property, newPos: pos};
  }

  /**
   * Get properties for a specific module instance
   */
  getModuleProperties(spfModuleInstanceId: number): ModuleProperty[] | null {
    const config = this.modulePropertyConfigs.find(
      c => c.spfModuleInstanceId === spfModuleInstanceId,
    );
    return config?.properties || null;
  }

  /**
   * Get specific property data for a module instance
   */
  getPropertyData(
    spfModuleInstanceId: number,
    propertyId: number,
  ): Uint8Array | null {
    const config = this.modulePropertyConfigs.find(
      c => c.spfModuleInstanceId === spfModuleInstanceId,
    );
    const property = config?.properties.find(p => p.propertyId === propertyId);
    return property?.data || null;
  }

  /**
   * Get port information for a module instance
   */
  getPortInfo(spfModuleInstanceId: number): PortInfo | null {
    const portData = this.getPropertyData(
      spfModuleInstanceId,
      MODULE_PROP_ID_PORT_INFO,
    );
    if (!portData || portData.length < 8) {
      return null;
    }

    const view = new DataView(
      portData.buffer,
      portData.byteOffset,
      portData.byteLength,
    );
    return {
      maxInputPorts: BinaryUtils.readUint32(view, 0),
      maxOutputPorts: BinaryUtils.readUint32(view, 4),
    };
  }

  /**
   * Get heap information for a module instance
   */
  getHeapInfo(spfModuleInstanceId: number): HeapInfo | null {
    const heapData = this.getPropertyData(
      spfModuleInstanceId,
      MODULE_PROP_ID_HEAP_ID,
    );
    if (!heapData || heapData.length < 4) {
      return null;
    }

    const view = new DataView(
      heapData.buffer,
      heapData.byteOffset,
      heapData.byteLength,
    );
    return {
      heapId: BinaryUtils.readUint32(view, 0),
    };
  }

  /**
   * Get all module instance IDs
   */
  getSpfModuleInstanceIds(): number[] {
    return this.modulePropertyConfigs.map(c => c.spfModuleInstanceId);
  }
}
