/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {AcdbContainerProperties} from './types.js';

/**
 * Handles parsing of container configuration properties from binary data.
 */
export class ContainerConfigProperty {
  /** List of container properties */
  readonly containerProperties: AcdbContainerProperties[] = [];

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
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'container count',
    );
    const configCount = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each container configuration
    for (let i = 0; i < configCount; i++) {
      pos = this.parseContainer(view, payload, pos);
    }
  }

  /**
   * Parse a single container configuration
   */
  private parseContainer(
    view: DataView,
    payload: Uint8Array,
    pos: number,
  ): number {
    // Read container instance ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'container instance ID',
    );
    const containerId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read property count
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'property count',
    );
    const propCount = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse properties for this container
    const {properties, newPos} = this.parseContainerProperties(
      view,
      payload,
      pos,
      propCount,
    );

    // Create container property
    const containerData: AcdbContainerProperties = {
      containerId,
      properties,
    };

    this.containerProperties.push(containerData);

    return newPos;
  }

  /**
   * Parse properties for a container
   */
  private parseContainerProperties(
    view: DataView,
    payload: Uint8Array,
    pos: number,
    propCount: number,
  ): {properties: Map<number, Uint8Array>; newPos: number} {
    const properties = new Map<number, Uint8Array>();

    for (let j = 0; j < propCount; j++) {
      // Read property ID
      this.validateLength(
        pos,
        BinaryUtils.SIZEOF_UINT32,
        payload.length,
        'property ID',
      );
      const propId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read property data length
      this.validateLength(
        pos,
        BinaryUtils.SIZEOF_UINT32,
        payload.length,
        'property length',
      );
      const length = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read property data
      this.validateLength(pos, length, payload.length, 'property data');
      const propData = payload.slice(pos, pos + length);
      pos += length;

      properties.set(propId, propData);
    }

    return {properties, newPos: pos};
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
      throw new Error(
        `[ContainerConfigProperty] Cannot read ${fieldName} at position ${pos}: required ${requiredBytes} bytes, but only ${totalLength - pos} bytes remaining (total payload length: ${totalLength})`,
      );
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
