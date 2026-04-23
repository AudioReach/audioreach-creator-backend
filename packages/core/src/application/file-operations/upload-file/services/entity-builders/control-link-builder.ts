/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {ControlLink as ControlLinkProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';

/**
 * Builder for converting ControlLink property data to ControlLink domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class ControlLinkBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build ControlLink entities from control link properties with system IDs assigned
   * Main API method similar to UsecaseBuilder.buildUsecases()
   * Uses early deduplication for optimal performance
   *
   * @returns Object containing control links and extracted intents for control ports
   */
  async buildControlLinks(
    controlLinkProperties: ControlLinkProperty[],
    fileSystemId: number,
  ): Promise<{
    controlLinks: ControlLink[];
    controlPortIntents: Map<number, number[]>;
  }> {
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

    // STEP 1: Early deduplication by composite key
    const {uniqueProperties, duplicateCount} = this.deduplicateProperties(
      controlLinkProperties,
    );

    this.logger?.logInfo({
      msg: `Control link deduplication: ${controlLinkProperties.length} total → ${uniqueProperties.size} unique properties (${duplicateCount} duplicates removed)`,
      action: 'control_link_deduplication',
      component: 'ControlLinkBuilder',
      tag: 'control-link-building',
      timestamp: new Date(),
    });

    // STEP 2: Build ControlLink objects and collect intents
    const {controlLinks, controlPortIntentsMap, successCount, errorCount} =
      this.processUniqueProperties(uniqueProperties, fileSystemId);

    // STEP 3: Assign system IDs to all successfully built entities
    if (controlLinks.length > 0) {
      await this.assignSystemIds(controlLinks, fileSystemId);
    }

    // STEP 4: Convert Sets to Arrays for final result
    const controlPortIntents = this.convertIntentSetsToArrays(
      controlPortIntentsMap,
    );

    // STEP 5: Performance and results logging
    this.logger?.logInfo({
      msg: `Control link building complete: ${controlLinkProperties.length} total → ${uniqueProperties.size} unique → ${successCount} successful, ${errorCount} failed (${duplicateCount} duplicates eliminated), ${controlPortIntents.size} control ports with intents, system IDs assigned`,
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
   * Assign system IDs to control links.
   * Mutates the input objects directly.
   *
   * @param controlLinks - Control links with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    controlLinks: ControlLink[],
    fileSystemId: number,
  ): Promise<void> {
    for (const controlLink of controlLinks) {
      // Assign system ID to control link
      controlLink.systemId = await this.idGenerator.getNextId(fileSystemId);
      // Note: Foreign key mappings are stored after DB insertion, not here
    }
  }

  /**
   * Deduplicate control link properties by composite key
   */
  private deduplicateProperties(controlLinkProperties: ControlLinkProperty[]): {
    uniqueProperties: Map<string, ControlLinkProperty>;
    duplicateCount: number;
  } {
    const uniqueProperties = new Map<string, ControlLinkProperty>();
    let duplicateCount = 0;

    for (const property of controlLinkProperties) {
      const compositeKey = this.createCompositeKey(property);

      if (uniqueProperties.has(compositeKey)) {
        duplicateCount++;
      } else {
        uniqueProperties.set(compositeKey, property);
      }
    }

    return {uniqueProperties, duplicateCount};
  }

  /**
   * Create composite key for deduplication
   * Ensures bidirectional links are treated as identical by normalizing the order
   * (e.g., 0x102:0x1 <-> 0x405:0x5 is same as 0x405:0x5 <-> 0x102:0x1)
   */
  private createCompositeKey(property: ControlLinkProperty): string {
    const peer1 = property.peer1InstanceId;
    const peer2 = property.peer2InstanceId;
    const port1 = property.peer1PortId;
    const port2 = property.peer2PortId;

    // Compare peer instances first, then ports if peers are equal
    // Always put the smaller peer-port combination first for consistent keys
    if (peer1 < peer2 || (peer1 === peer2 && port1 <= port2)) {
      return `${peer1}-${port1}-${peer2}-${port2}`;
    } else {
      return `${peer2}-${port2}-${peer1}-${port1}`;
    }
  }

  /**
   * Process unique properties to build control links and collect intents
   */
  private processUniqueProperties(
    uniqueProperties: Map<string, ControlLinkProperty>,
    fileSystemId: number,
  ): {
    controlLinks: ControlLink[];
    controlPortIntentsMap: Map<number, Set<number>>;
    successCount: number;
    errorCount: number;
  } {
    const controlLinks: ControlLink[] = [];
    const controlPortIntentsMap = new Map<number, Set<number>>();
    let successCount = 0;
    let errorCount = 0;

    for (const property of uniqueProperties.values()) {
      const result = this.processControlLinkProperty(
        property,
        fileSystemId,
        controlPortIntentsMap,
      );

      if (result.success) {
        controlLinks.push(result.controlLink!);
        successCount++;
      } else {
        errorCount++;
      }
    }

    return {controlLinks, controlPortIntentsMap, successCount, errorCount};
  }

  /**
   * Process a single control link property
   */
  private processControlLinkProperty(
    property: ControlLinkProperty,
    fileSystemId: number,
    controlPortIntentsMap: Map<number, Set<number>>,
  ): {success: boolean; controlLink?: ControlLink} {
    try {
      const {controlLink, nodeAPortSystemId, nodeBPortSystemId, intents} =
        this.convertControlLinkProperty(property, fileSystemId);

      this.collectIntentsForPorts(
        intents,
        nodeAPortSystemId,
        nodeBPortSystemId,
        controlPortIntentsMap,
      );

      return {success: true, controlLink};
    } catch (error) {
      this.logger?.logWarn({
        msg: `Failed to convert control link property (peer1: ${property.peer1InstanceId}, peer2: ${property.peer2InstanceId}): ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'control_link_conversion_failed',
        component: 'ControlLinkBuilder',
        tag: 'control-link-building',
        timestamp: new Date(),
      });
      return {success: false};
    }
  }

  /**
   * Collect intents for both control ports
   */
  private collectIntentsForPorts(
    intents: number[],
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    controlPortIntentsMap: Map<number, Set<number>>,
  ): void {
    if (intents.length === 0) {
      return;
    }

    this.addIntentsToPort(nodeAPortSystemId, intents, controlPortIntentsMap);
    this.addIntentsToPort(nodeBPortSystemId, intents, controlPortIntentsMap);
  }

  /**
   * Add intents to a specific port
   */
  private addIntentsToPort(
    portSystemId: number,
    intents: number[],
    controlPortIntentsMap: Map<number, Set<number>>,
  ): void {
    if (!controlPortIntentsMap.has(portSystemId)) {
      controlPortIntentsMap.set(portSystemId, new Set());
    }

    const portIntents = controlPortIntentsMap.get(portSystemId)!;
    for (const intent of intents) {
      portIntents.add(intent);
    }
  }

  /**
   * Convert intent Sets to Arrays
   */
  private convertIntentSetsToArrays(
    controlPortIntentsMap: Map<number, Set<number>>,
  ): Map<number, number[]> {
    const controlPortIntents = new Map<number, number[]>();

    for (const [portSystemId, intentsSet] of controlPortIntentsMap.entries()) {
      controlPortIntents.set(portSystemId, [...intentsSet]);
    }

    return controlPortIntents;
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

    // Use intents and heapId directly from property
    const intents = property.intents;
    const heapId = property.heapId;

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
   * Get module instance systemId from foreign key mapper
   */
  private getSpfModuleSystemId(instanceId: number): number {
    const systemId = this.foreignKeyMapper.getSpfModuleSystemId(
      asNaturalId(instanceId),
    );
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
      asSystemId(moduleSystemId),
      asNaturalId(portNaturalId),
    );
    if (!systemId) {
      throw new Error(
        `No control port systemId mapping found for module ${moduleSystemId}, port ${portNaturalId}`,
      );
    }
    return systemId;
  }
}
