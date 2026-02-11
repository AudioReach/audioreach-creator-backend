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
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read module property config count from payload');
    }

    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each module property configuration
    for (let i = 0; i < count; i++) {
      // Read module instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read module instance ID at position ${pos}`);
      }

      const moduleInstanceId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read property count
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read property count at position ${pos}`);
      }

      const propCount = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Parse properties for this module
      const properties: ModuleProperty[] = [];

      for (let j = 0; j < propCount; j++) {
        // Read property ID
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read property ID at position ${pos}`);
        }

        const propId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read property size
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read property size at position ${pos}`);
        }

        const propSize = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read property data
        if (pos + propSize > payload.length) {
          throw new Error(
            `Cannot read property data at position ${pos}, size ${propSize}`,
          );
        }

        const propData = payload.slice(pos, pos + propSize);
        pos += propSize;

        // Create module property
        const moduleProperty: ModuleProperty = {
          propertyId: propId,
          data: propData,
        };

        properties.push(moduleProperty);
      }

      // Create module property configuration with implementation
      const modulePropertyConfig = new ModulePropertyConfigImpl(
        moduleInstanceId,
        properties,
      );

      this.modulePropertyConfigs.push(modulePropertyConfig);
    }
  }

  /**
   * Get properties for a specific module instance
   */
  getModuleProperties(moduleInstanceId: number): ModuleProperty[] | null {
    const config = this.modulePropertyConfigs.find(
      c => c.moduleInstanceId === moduleInstanceId,
    );
    return config?.properties || null;
  }

  /**
   * Get specific property data for a module instance
   */
  getPropertyData(
    moduleInstanceId: number,
    propertyId: number,
  ): Uint8Array | null {
    const config = this.modulePropertyConfigs.find(
      c => c.moduleInstanceId === moduleInstanceId,
    );
    const property = config?.properties.find(p => p.propertyId === propertyId);
    return property?.data || null;
  }

  /**
   * Get port information for a module instance
   */
  getPortInfo(moduleInstanceId: number): PortInfo | null {
    const portData = this.getPropertyData(
      moduleInstanceId,
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
  getHeapInfo(moduleInstanceId: number): HeapInfo | null {
    const heapData = this.getPropertyData(
      moduleInstanceId,
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
  getModuleInstanceIds(): number[] {
    return this.modulePropertyConfigs.map(c => c.moduleInstanceId);
  }
}
