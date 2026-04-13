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
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'subgraph count',
    );
    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each subgraph configuration
    for (let i = 0; i < count; i++) {
      const result = this.parseSubgraphProperty(view, payload, pos);
      this.subgraphProperties.push(result.property);
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
      throw new Error(
        `[SubgraphConfigProperty] Cannot read ${fieldName} at position ${pos}: required ${requiredBytes} bytes, but only ${totalLength - pos} bytes remaining (total payload length: ${totalLength})`,
      );
    }
  }

  /**
   * Parse a single subgraph property
   */
  private parseSubgraphProperty(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {property: SubgraphProperty; newPos: number} {
    let pos = startPos;

    // Read subgraph ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'subgraph ID',
    );
    const subgraphId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse properties for this subgraph
    const result = this.parseProperties(view, payload, pos);
    const properties = result.properties;
    pos = result.newPos;

    const property: SubgraphProperty = {
      subgraphId,
      properties,
    };

    return {property, newPos: pos};
  }

  /**
   * Parse properties for a subgraph
   */
  private parseProperties(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {properties: Map<number, Uint8Array>; newPos: number} {
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

    const properties = new Map<number, Uint8Array>();

    for (let j = 0; j < propCount; j++) {
      const result = this.parseProperty(view, payload, pos);
      properties.set(result.propId, result.propData);
      pos = result.newPos;
    }

    return {properties, newPos: pos};
  }

  /**
   * Parse a single property
   */
  private parseProperty(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {propId: number; propData: Uint8Array; newPos: number} {
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

    return {propId, propData, newPos: pos};
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
