/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {ContainerProperty} from './types.js';

/**
 * Handles parsing of container configuration properties from binary data.
 */
export class ContainerConfigProperty {
  /** List of container properties */
  readonly containerProperties: ContainerProperty[] = [];

  private constructor() {}

  /**
   * Create ContainerConfigProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): ContainerConfigProperty {
    const instance = new ContainerConfigProperty();
    instance.parsePayload(payload);
    return instance;
  }

  /**
   * Parse binary payload into container properties
   */
  private parsePayload(payload: Uint8Array): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of container configurations
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read container count from payload');
    }

    const configCount = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each container configuration
    for (let i = 0; i < configCount; i++) {
      // Read container instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read container instance ID at position ${pos}`);
      }

      const containerId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read property count
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read property count at position ${pos}`);
      }

      const propCount = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Parse properties for this container
      const properties = new Map<number, Uint8Array>();

      for (let j = 0; j < propCount; j++) {
        // Read property ID
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read property ID at position ${pos}`);
        }

        const propId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read property data length
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read property length at position ${pos}`);
        }

        const length = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read property data
        if (pos + length > payload.length) {
          throw new Error(
            `Cannot read property data at position ${pos}, length ${length}`,
          );
        }

        const propData = payload.slice(pos, pos + length);
        pos += length;

        properties.set(propId, propData);
      }

      // Create container property
      const containerProperty: ContainerProperty = {
        containerId,
        properties,
      };

      this.containerProperties.push(containerProperty);
    }
  }

  /**
   * Get property data for a specific container and property ID
   */
  getPropertyData(containerId: number, propertyId: number): Uint8Array | null {
    const container = this.containerProperties.find(
      c => c.containerId === containerId,
    );
    return container?.properties.get(propertyId) || null;
  }

  /**
   * Get all properties for a specific container
   */
  getContainerProperties(containerId: number): Map<number, Uint8Array> | null {
    const container = this.containerProperties.find(
      c => c.containerId === containerId,
    );
    return container?.properties || null;
  }

  /**
   * Get all container IDs
   */
  getContainerIds(): number[] {
    return this.containerProperties.map(c => c.containerId);
  }
}
