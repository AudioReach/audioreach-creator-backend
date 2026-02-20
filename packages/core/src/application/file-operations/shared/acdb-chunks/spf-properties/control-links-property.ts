/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {ControlLink} from './types.js';
import {
  MODULE_PROP_ID_CTRL_HEAP_ID,
  HEAP_ID_DEFAULT,
} from '../../constants/spf-ids.js';

/**
 * Handles parsing of control links properties from binary data.
 */
export class ControlLinksProperty {
  /** List of control links */
  readonly controlLinks: ControlLink[] = [];

  private constructor() {}

  /**
   * Create ControlLinksProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): ControlLinksProperty {
    const instance = new ControlLinksProperty();
    instance.parsePayload(payload);
    return instance;
  }

  /**
   * Parse binary payload into control links
   */
  private parsePayload(payload: Uint8Array): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of control links
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'control link count',
    );
    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each control link
    for (let i = 0; i < count; i++) {
      const result = this.parseControlLink(view, payload, pos);
      this.controlLinks.push(result.controlLink);
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
   * Parse a single control link from the payload
   */
  private parseControlLink(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {controlLink: ControlLink; newPos: number} {
    let pos = startPos;

    // Read peer 1 module instance ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'peer1 instance ID',
    );
    const peer1InstanceId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read peer 1 port ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'peer1 port ID',
    );
    const peer1PortId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read peer 2 module instance ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'peer2 instance ID',
    );
    const peer2InstanceId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read peer 2 port ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'peer2 port ID',
    );
    const peer2PortId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse properties
    const result = this.parseProperties(view, payload, pos);
    const properties = result.properties;
    pos = result.newPos;

    // Add default heap ID if not present
    this.addDefaultHeapIdIfNeeded(properties);

    // Create control link
    const controlLink: ControlLink = {
      peer1InstanceId,
      peer1PortId,
      peer2InstanceId,
      peer2PortId,
      properties,
    };

    return {controlLink, newPos: pos};
  }

  /**
   * Parse properties for a control link
   */
  private parseProperties(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {properties: Map<number, Uint8Array>; newPos: number} {
    let pos = startPos;

    // Read number of properties
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'property count',
    );
    const numProps = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const properties = new Map<number, Uint8Array>();

    for (let j = 0; j < numProps; j++) {
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

    return {propId, propData, newPos: pos};
  }

  /**
   * Add default heap ID to properties if not present
   */
  private addDefaultHeapIdIfNeeded(properties: Map<number, Uint8Array>): void {
    if (!properties.has(MODULE_PROP_ID_CTRL_HEAP_ID)) {
      const defaultHeapData = new Uint8Array(4);
      const defaultView = new DataView(defaultHeapData.buffer);
      BinaryUtils.writeUint32(defaultView, 0, HEAP_ID_DEFAULT);
      properties.set(MODULE_PROP_ID_CTRL_HEAP_ID, defaultHeapData);
    }
  }

  /**
   * Get all control links involving a specific instance
   */
  getControlLinksForInstance(instanceId: number): ControlLink[] {
    return this.controlLinks.filter(
      link =>
        link.peer1InstanceId === instanceId ||
        link.peer2InstanceId === instanceId,
    );
  }

  /**
   * Get control link between two specific instances and ports
   */
  getControlLink(
    peer1InstanceId: number,
    peer1PortId: number,
    peer2InstanceId: number,
    peer2PortId: number,
  ): ControlLink | null {
    return (
      this.controlLinks.find(
        link =>
          (link.peer1InstanceId === peer1InstanceId &&
            link.peer1PortId === peer1PortId &&
            link.peer2InstanceId === peer2InstanceId &&
            link.peer2PortId === peer2PortId) ||
          (link.peer1InstanceId === peer2InstanceId &&
            link.peer1PortId === peer2PortId &&
            link.peer2InstanceId === peer1InstanceId &&
            link.peer2PortId === peer1PortId),
      ) || null
    );
  }

  /**
   * Get property data for a specific control link
   */
  getControlLinkProperty(
    peer1InstanceId: number,
    peer1PortId: number,
    peer2InstanceId: number,
    peer2PortId: number,
    propertyId: number,
  ): Uint8Array | null {
    const link = this.getControlLink(
      peer1InstanceId,
      peer1PortId,
      peer2InstanceId,
      peer2PortId,
    );
    return link?.properties.get(propertyId) || null;
  }

  /**
   * Get all unique instance IDs involved in control links
   */
  getInstanceIds(): number[] {
    const instanceIds = new Set<number>();
    for (const link of this.controlLinks) {
      instanceIds.add(link.peer1InstanceId);
      instanceIds.add(link.peer2InstanceId);
    }
    return [...instanceIds];
  }
}
