/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {SpfModuleInfo, SpfModuleInstance} from './types.js';

/**
 * Handles parsing of module list properties from binary data.
 */
export class ModuleListProperty {
  /** List of module instance information */
  readonly spfModuleInfos: SpfModuleInfo[] = [];

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
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'module instance info count',
    );
    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each module instance info entry
    for (let i = 0; i < count; i++) {
      const result = this.parseSpfModuleInfo(view, payload, pos);
      this.spfModuleInfos.push(result.info);
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
        `[ModuleListProperty] Cannot read ${fieldName} at position ${pos}: required ${requiredBytes} bytes, but only ${totalLength - pos} bytes remaining (total payload length: ${totalLength})`,
      );
    }
  }

  /**
   * Parse a single module instance info entry
   */
  private parseSpfModuleInfo(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {info: SpfModuleInfo; newPos: number} {
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

    // Read container ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'container ID',
    );
    const containerId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse module instances
    const result = this.parseSpfModules(view, payload, pos);
    const spfModules = result.instances;
    pos = result.newPos;

    // Create module instance info
    const info: SpfModuleInfo = {
      subgraphId,
      containerId,
      spfModules: spfModules,
    };

    return {info, newPos: pos};
  }

  /**
   * Parse module instances for a module instance info entry
   */
  private parseSpfModules(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {instances: SpfModuleInstance[]; newPos: number} {
    let pos = startPos;

    // Read module instance count
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'module instance count',
    );
    const moduleInstCount = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const spfModules: SpfModuleInstance[] = [];

    for (let j = 0; j < moduleInstCount; j++) {
      const result = this.parseSpfModule(view, payload, pos);
      spfModules.push(result.instance);
      pos = result.newPos;
    }

    return {instances: spfModules, newPos: pos};
  }

  /**
   * Parse a single module instance
   */
  private parseSpfModule(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
  ): {instance: SpfModuleInstance; newPos: number} {
    let pos = startPos;

    // Read module ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'module ID',
    );
    const moduleId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read instance ID
    this.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'instance ID',
    );
    const instanceId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const instance: SpfModuleInstance = {
      moduleId,
      instanceId,
    };

    return {instance, newPos: pos};
  }

  /**
   * Get module instances for a specific subgraph and container
   */
  getSpfModules(
    subgraphId: number,
    containerId: number,
  ): SpfModuleInstance[] | null {
    const info = this.spfModuleInfos.find(
      mi => mi.subgraphId === subgraphId && mi.containerId === containerId,
    );
    return info?.spfModules || null;
  }

  /**
   * Get module ID for a specific instance ID
   */
  getModuleId(instanceId: number): number | null {
    for (const info of this.spfModuleInfos) {
      const instance = info.spfModules.find(mi => mi.instanceId === instanceId);
      if (instance) {
        return instance.moduleId;
      }
    }
    return null;
  }

  /**
   * Get all module instance infos for a specific subgraph
   */
  getSpfModuleInfosBySubgraph(subgraphId: number): SpfModuleInfo[] {
    return this.spfModuleInfos.filter(mi => mi.subgraphId === subgraphId);
  }

  /**
   * Get all unique subgraph IDs
   */
  getSubgraphIds(): number[] {
    const subgraphIds = new Set(this.spfModuleInfos.map(mi => mi.subgraphId));
    return [...subgraphIds];
  }

  /**
   * Get all unique container IDs
   */
  getContainerIds(): number[] {
    const containerIds = new Set(this.spfModuleInfos.map(mi => mi.containerId));
    return [...containerIds];
  }
}
