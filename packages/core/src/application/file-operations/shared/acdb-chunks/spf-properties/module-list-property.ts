/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {ModuleInstanceInfo, ModuleInstance} from './types.js';

/**
 * Handles parsing of module list properties from binary data.
 */
export class ModuleListProperty {
  /** List of module instance information */
  readonly moduleInstanceInfos: ModuleInstanceInfo[] = [];

  private constructor() {}

  /**
   * Create ModuleListProperty from binary payload
   */
  static fromPayload(payload: Uint8Array): ModuleListProperty {
    const instance = new ModuleListProperty();
    instance.parsePayload(payload);
    return instance;
  }

  /**
   * Parse binary payload into module instance information
   */
  private parsePayload(payload: Uint8Array): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of module instance info entries
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read module instance info count from payload');
    }

    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each module instance info entry
    for (let i = 0; i < count; i++) {
      // Read subgraph ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read subgraph ID at position ${pos}`);
      }

      const subgraphId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read container ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read container ID at position ${pos}`);
      }

      const containerId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read module instance count
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read module instance count at position ${pos}`);
      }

      const moduleInstCount = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Parse module instances
      const moduleInstances: ModuleInstance[] = [];

      for (let j = 0; j < moduleInstCount; j++) {
        // Read module ID
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read module ID at position ${pos}`);
        }

        const moduleId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read instance ID
        if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
          throw new Error(`Cannot read instance ID at position ${pos}`);
        }

        const instanceId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Create module instance
        const moduleInstance: ModuleInstance = {
          moduleId,
          instanceId,
        };

        moduleInstances.push(moduleInstance);
      }

      // Create module instance info
      const moduleInstanceInfo: ModuleInstanceInfo = {
        subgraphId,
        containerId,
        moduleInstances,
      };

      this.moduleInstanceInfos.push(moduleInstanceInfo);
    }
  }

  /**
   * Get module instances for a specific subgraph and container
   */
  getModuleInstances(
    subgraphId: number,
    containerId: number,
  ): ModuleInstance[] | null {
    const info = this.moduleInstanceInfos.find(
      mi => mi.subgraphId === subgraphId && mi.containerId === containerId,
    );
    return info?.moduleInstances || null;
  }

  /**
   * Get module ID for a specific instance ID
   */
  getModuleId(instanceId: number): number | null {
    for (const info of this.moduleInstanceInfos) {
      const instance = info.moduleInstances.find(
        mi => mi.instanceId === instanceId,
      );
      if (instance) {
        return instance.moduleId;
      }
    }
    return null;
  }

  /**
   * Get all module instance infos for a specific subgraph
   */
  getModuleInstanceInfosBySubgraph(subgraphId: number): ModuleInstanceInfo[] {
    return this.moduleInstanceInfos.filter(mi => mi.subgraphId === subgraphId);
  }

  /**
   * Get all unique subgraph IDs
   */
  getSubgraphIds(): number[] {
    const subgraphIds = new Set(
      this.moduleInstanceInfos.map(mi => mi.subgraphId),
    );
    return [...subgraphIds];
  }

  /**
   * Get all unique container IDs
   */
  getContainerIds(): number[] {
    const containerIds = new Set(
      this.moduleInstanceInfos.map(mi => mi.containerId),
    );
    return [...containerIds];
  }
}
