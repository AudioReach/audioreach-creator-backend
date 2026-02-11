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

/**
 * Implementation of ModulePropertyConfig interface with utility methods
 */
export class ModulePropertyConfigImpl implements ModulePropertyConfig {
  constructor(
    public readonly moduleInstanceId: number,
    public readonly properties: ModuleProperty[],
  ) {}

  /**
   * Get specific property data by property ID
   */
  getPropertyData(propertyId: number): Uint8Array | null {
    const property = this.properties.find(p => p.propertyId === propertyId);
    return property?.data || null;
  }

  /**
   * Get port information for this module
   */
  getPortInfo(): PortInfo | null {
    const portData = this.getPropertyData(MODULE_PROP_ID_PORT_INFO);
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
   * Get heap information for this module
   */
  getHeapInfo(): HeapInfo | null {
    const heapData = this.getPropertyData(MODULE_PROP_ID_HEAP_ID);
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
}
