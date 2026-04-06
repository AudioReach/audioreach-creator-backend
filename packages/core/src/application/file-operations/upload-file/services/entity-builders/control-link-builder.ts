/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {ControlLink as ControlLinkProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  MODULE_PROP_ID_CTRL_HEAP_ID,
  MODULE_PROP_ID_CTRL_LINK_INTENTS,
} from '../../../shared/constants/spf-ids.js';

/**
 * Builder for converting ControlLink property data to ControlLink domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class ControlLinkBuilder {
  constructor(
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build ControlLink entities from control link properties
   * Main API method similar to UsecaseBuilder.buildUsecases()
   * Uses early deduplication for optimal performance
   *
   * @returns Object containing control links and extracted intents for control ports
   */
  buildControlLinks(
    controlLinkProperties: ControlLinkProperty[],
    fileSystemId: number,
  ): {
    controlLinks: ControlLink[];
    controlPortIntents: Map<number, number[]>;
  } {
    // Input validation
    if (!controlLinkProperties || controlLinkProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No control link properties provided for building',
        action: 'no_control_link_properties',
        component: 'ControlLinkBuilder',
        tag: 'control-link-building',
        timestamp: new Date(),
      });
      return {
        controlLinks: [],
        controlPortIntents: new Map(),
      };
    }

    // STEP 1: Early deduplication by composite key (Performance Optimization)
    const uniqueProperties = new Map<string, ControlLinkProperty>();
    let duplicateCount = 0;

    for (const property of controlLinkProperties) {
      // Create composite key for deduplication (matches DB unique constraint)
      const compositeKey = `${property.peer1InstanceId}-${property.peer2InstanceId}-${property.peer1PortId}-${property.peer2PortId}`;

      if (uniqueProperties.has(compositeKey)) {
        duplicateCount++;
      } else {
        uniqueProperties.set(compositeKey, property);
      }
    }

    // Log deduplication results
    this.logger?.logInfo({
      msg: `Control link deduplication: ${controlLinkProperties.length} total → ${uniqueProperties.size} unique properties (${duplicateCount} duplicates removed)`,
      action: 'control_link_deduplication',
      component: 'ControlLinkBuilder',
      tag: 'control-link-building',
      timestamp: new Date(),
    });

    // STEP 2: Build ControlLink objects and collect intents (Efficient Processing)
    const controlLinks: ControlLink[] = [];
    const controlPortIntentsMap = new Map<number, Set<number>>();
    let successCount = 0;
    let errorCount = 0;

    for (const property of uniqueProperties.values()) {
      try {
        const {controlLink, nodeAPortSystemId, nodeBPortSystemId, intents} =
          this.convertControlLinkProperty(property, fileSystemId);
        controlLinks.push(controlLink);

        // Collect intents for both control ports
        if (intents.length > 0) {
          // Add intents to nodeA port
          if (!controlPortIntentsMap.has(nodeAPortSystemId)) {
            controlPortIntentsMap.set(nodeAPortSystemId, new Set());
          }
          for (const intent of intents)
            controlPortIntentsMap.get(nodeAPortSystemId)!.add(intent);

          // Add intents to nodeB port
          if (!controlPortIntentsMap.has(nodeBPortSystemId)) {
            controlPortIntentsMap.set(nodeBPortSystemId, new Set());
          }
          for (const intent of intents)
            controlPortIntentsMap.get(nodeBPortSystemId)!.add(intent);
        }

        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert control link property (peer1: ${property.peer1InstanceId}, peer2: ${property.peer2InstanceId}): ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'control_link_conversion_failed',
          component: 'ControlLinkBuilder',
          tag: 'control-link-building',
          timestamp: new Date(),
        });
      }
    }

    // Convert Set to Array for final result
    const controlPortIntents = new Map<number, number[]>();
    for (const [portSystemId, intentsSet] of controlPortIntentsMap.entries()) {
      controlPortIntents.set(portSystemId, [...intentsSet]);
    }

    // STEP 3: Performance and results logging
    this.logger?.logInfo({
      msg: `Control link building complete: ${controlLinkProperties.length} total → ${uniqueProperties.size} unique → ${successCount} successful, ${errorCount} failed (${duplicateCount} duplicates eliminated), ${controlPortIntents.size} control ports with intents`,
      action: 'control_link_building_complete',
      component: 'ControlLinkBuilder',
      tag: 'control-link-building',
      timestamp: new Date(),
    });

    return {
      controlLinks,
      controlPortIntents,
    };
  }

  /**
   * Convert single ControlLinkProperty to ControlLink entity
   * Also extracts intents for control ports
   */
  private convertControlLinkProperty(
    property: ControlLinkProperty,
    fileSystemId: number,
  ): {
    controlLink: ControlLink;
    nodeAPortSystemId: number;
    nodeBPortSystemId: number;
    intents: number[];
  } {
    // Get node systemIds from foreign key mapper
    const peerNodeASystemId = this.getSpfModuleSystemId(
      property.peer1InstanceId,
    );
    const peerNodeBSystemId = this.getSpfModuleSystemId(
      property.peer2InstanceId,
    );

    // Get port systemIds from foreign key mapper
    const nodeAPortSystemId = this.getControlPortSystemId(
      peerNodeASystemId,
      property.peer1PortId,
    );
    const nodeBPortSystemId = this.getControlPortSystemId(
      peerNodeBSystemId,
      property.peer2PortId,
    );

    // Extract intents from properties map
    const intents = this.extractIntents(property.properties);

    // Extract heapId from properties map
    const heapId = this.extractHeapId(property.properties);

    // Create ControlLink entity (without intents - they go to control ports)
    const controlLink = new ControlLink(
      0, // systemId - Will be generated during insertion
      fileSystemId, // Associate with the file being uploaded
      peerNodeASystemId,
      peerNodeBSystemId,
      nodeAPortSystemId,
      nodeBPortSystemId,
      heapId,
      property.isInterGraph, // Use the calculated value from parser
    );

    return {
      controlLink,
      nodeAPortSystemId,
      nodeBPortSystemId,
      intents,
    };
  }

  /**
   * Extract heapId from properties map
   */
  private extractHeapId(properties: Map<number, Uint8Array>): number {
    const heapIdData = properties.get(MODULE_PROP_ID_CTRL_HEAP_ID);

    if (!heapIdData || heapIdData.length < BinaryUtils.SIZEOF_UINT32) {
      this.logger?.logWarn({
        msg: 'HeapId property not found or invalid, using default value 0',
        action: 'heap_id_default',
        component: 'ControlLinkBuilder',
        tag: 'control-link-building',
        timestamp: new Date(),
      });
      return 0; // Default value
    }

    const view = new DataView(
      heapIdData.buffer,
      heapIdData.byteOffset,
      heapIdData.byteLength,
    );
    return BinaryUtils.readUint32(view, 0);
  }

  /**
   * Extract intents from properties map
   */
  private extractIntents(properties: Map<number, Uint8Array>): number[] {
    const intentsData = properties.get(MODULE_PROP_ID_CTRL_LINK_INTENTS);

    if (!intentsData || intentsData.length === 0) {
      return []; // No intents property found, return empty array
    }

    try {
      const view = new DataView(
        intentsData.buffer,
        intentsData.byteOffset,
        intentsData.byteLength,
      );
      let pos = 0;

      // Read count of intents
      if (intentsData.length < BinaryUtils.SIZEOF_UINT32) {
        throw new Error('Intents data too short to read count');
      }
      const count = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Validate we have enough data for all intents
      const expectedLength =
        BinaryUtils.SIZEOF_UINT32 + count * BinaryUtils.SIZEOF_UINT32;
      if (intentsData.length < expectedLength) {
        throw new Error(
          `Intents data too short: expected ${expectedLength} bytes, got ${intentsData.length}`,
        );
      }

      // Read each intent ID
      const intents: number[] = [];
      for (let i = 0; i < count; i++) {
        const intent = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        intents.push(intent);
      }

      return intents;
    } catch (error) {
      this.logger?.logWarn({
        msg: `Failed to extract intents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'intents_extraction_failed',
        component: 'ControlLinkBuilder',
        tag: 'control-link-building',
        timestamp: new Date(),
      });
      return []; // Return empty array on error
    }
  }

  /**
   * Get module instance systemId from foreign key mapper
   */
  private getSpfModuleSystemId(instanceId: number): number {
    const systemId = this.foreignKeyMapper.getSpfModuleSystemId(instanceId);
    if (!systemId) {
      throw new Error(
        `No module instance systemId mapping found for instanceId ${instanceId}`,
      );
    }
    return systemId;
  }

  /**
   * Get control port systemId from foreign key mapper
   */
  private getControlPortSystemId(
    moduleSystemId: number,
    portNaturalId: number,
  ): number {
    const systemId = this.foreignKeyMapper.getControlPortSystemId(
      moduleSystemId,
      portNaturalId,
    );
    if (!systemId) {
      throw new Error(
        `No control port systemId mapping found for module ${moduleSystemId}, port ${portNaturalId}`,
      );
    }
    return systemId;
  }
}
