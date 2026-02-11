/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {SubgraphProperty} from './types.js';

/**
 * Handles parsing of subgraph configuration properties from binary data.
 */
export class SubgraphConfigProperty {
  /** List of subgraph properties */
  readonly subgraphProperties: SubgraphProperty[] = [];

  private constructor() {}

  /**
   * Create SubgraphConfigProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): SubgraphConfigProperty {
    const instance = new SubgraphConfigProperty();
    instance.parsePayload(payload);
    return instance;
  }

  /**
   * Parse binary payload into subgraph properties
   */
  private parsePayload(payload: Uint8Array): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of subgraph configurations
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read subgraph count from payload');
    }

    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each subgraph configuration
    for (let i = 0; i < count; i++) {
      // Read subgraph ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read subgraph ID at position ${pos}`);
      }

      const subgraphId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read property count
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read property count at position ${pos}`);
      }

      const propCount = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Parse properties for this subgraph
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

      // Create subgraph property
      const subgraphProperty: SubgraphProperty = {
        subgraphId,
        properties,
      };

      this.subgraphProperties.push(subgraphProperty);
    }
  }

  /**
   * Get property data for a specific subgraph and property ID
   */
  getPropertyData(subgraphId: number, propertyId: number): Uint8Array | null {
    const subgraph = this.subgraphProperties.find(
      sg => sg.subgraphId === subgraphId,
    );
    return subgraph?.properties.get(propertyId) || null;
  }

  /**
   * Get all properties for a specific subgraph
   */
  getSubgraphProperties(subgraphId: number): Map<number, Uint8Array> | null {
    const subgraph = this.subgraphProperties.find(
      sg => sg.subgraphId === subgraphId,
    );
    return subgraph?.properties || null;
  }

  /**
   * Get all subgraph IDs
   */
  getSubgraphIds(): number[] {
    return this.subgraphProperties.map(sg => sg.subgraphId);
  }
}
