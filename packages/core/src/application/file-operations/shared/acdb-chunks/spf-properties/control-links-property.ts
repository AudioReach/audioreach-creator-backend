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
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read control link count from payload');
    }

    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each control link
    for (let i = 0; i < count; i++) {
      // Read peer 1 module instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read peer1 instance ID at position ${pos}`);
      }

      const peer1InstanceId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read peer 1 port ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read peer1 port ID at position ${pos}`);
      }

      const peer1PortId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read peer 2 module instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read peer2 instance ID at position ${pos}`);
      }

      const peer2InstanceId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read peer 2 port ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read peer2 port ID at position ${pos}`);
      }

      const peer2PortId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read number of properties
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read property count at position ${pos}`);
      }

      const numProps = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Parse properties
      const properties = new Map<number, Uint8Array>();

      for (let j = 0; j < numProps; j++) {
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

        properties.set(propId, propData);
      }

      // Add default heap ID if not present
      if (!properties.has(MODULE_PROP_ID_CTRL_HEAP_ID)) {
        const defaultHeapData = new Uint8Array(4);
        const defaultView = new DataView(defaultHeapData.buffer);
        BinaryUtils.writeUint32(defaultView, 0, HEAP_ID_DEFAULT);
        properties.set(MODULE_PROP_ID_CTRL_HEAP_ID, defaultHeapData);
      }

      // Create control link
      const controlLink: ControlLink = {
        peer1InstanceId,
        peer1PortId,
        peer2InstanceId,
        peer2PortId,
        properties,
      };

      this.controlLinks.push(controlLink);
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
