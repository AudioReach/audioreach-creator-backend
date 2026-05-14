/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {DataLink as DataLinkProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';

/**
 * Builder for converting DataLink property data to DataLink domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class DataLinkBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build DataLink entities from data link properties with system IDs assigned
   * Main API method similar to UsecaseBuilder.buildUsecases()
   * Uses early deduplication for optimal performance
   */
  async buildDataLinks(
    dataLinkProperties: DataLinkProperty[],
    fileSystemId: number,
  ): Promise<DataLink[]> {
    // Input validation
    if (!dataLinkProperties || dataLinkProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No data link properties provided for building',
        action: 'no_data_link_properties',
        component: 'DataLinkBuilder',
        tag: 'data-link-building',
        timestamp: new Date(),
      });
      return [];
    }

    // STEP 1: Early deduplication by composite natural key
    const uniqueProperties = new Map<string, DataLinkProperty>();
    let duplicateCount = 0;

    for (const property of dataLinkProperties) {
      const key = `${property.sourceInstanceId}:${property.sourcePortId}->${property.destinationInstanceId}:${property.destinationPortId}`;
      if (uniqueProperties.has(key)) {
        duplicateCount++;
      } else {
        uniqueProperties.set(key, property);
      }
    }

    // Log deduplication results
    this.logger?.logInfo({
      msg: `Data link deduplication: ${dataLinkProperties.length} total → ${uniqueProperties.size} unique properties (${duplicateCount} duplicates removed)`,
      action: 'data_link_deduplication',
      component: 'DataLinkBuilder',
      tag: 'data-link-building',
      timestamp: new Date(),
    });

    // STEP 2: Build DataLink objects only for unique properties (Efficient Processing)
    const dataLinks: DataLink[] = [];
    const propertyByLink = new Map<DataLink, DataLinkProperty>();
    let successCount = 0;
    let failureCount = 0;

    for (const property of uniqueProperties.values()) {
      const dataLink = this.convertDataLinkProperty(property, fileSystemId);

      if (dataLink === null) {
        failureCount++;
        // The specific failure reason was already logged in convertDataLinkProperty
      } else {
        dataLinks.push(dataLink);
        propertyByLink.set(dataLink, property);
        successCount++;
      }
    }

    // STEP 3: Assign system IDs to all successfully built entities
    if (dataLinks.length > 0) {
      await this.assignSystemIds(dataLinks, fileSystemId);
    }

    // STEP 4: Register data link → systemId mappings in ForeignKeyMapper
    for (const link of dataLinks) {
      const prop = propertyByLink.get(link)!;
      this.foreignKeyMapper.addDataLinkMapping(
        prop.sourceInstanceId,
        prop.sourcePortId,
        prop.destinationInstanceId,
        prop.destinationPortId,
        asSystemId(link.systemId),
      );
    }

    // STEP 5: Performance and results logging
    this.logger?.logInfo({
      msg: `Data link building complete: ${dataLinkProperties.length} total → ${uniqueProperties.size} unique → ${successCount} successful, ${failureCount} failed (${duplicateCount} duplicates eliminated), system IDs assigned`,
      action: 'data_link_building_complete',
      component: 'DataLinkBuilder',
      tag: 'data-link-building',
      timestamp: new Date(),
    });

    return dataLinks;
  }

  /**
   * Assign system IDs to data links.
   * Mutates the input objects directly.
   *
   * @param dataLinks - Data links with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    dataLinks: DataLink[],
    fileSystemId: number,
  ): Promise<void> {
    for (const dataLink of dataLinks) {
      // Assign system ID to data link
      dataLink.systemId = await this.idGenerator.getNextId(fileSystemId);
      // Note: Foreign key mappings are stored after DB insertion, not here
    }
  }

  /**
   * Convert single DataLinkProperty to DataLink entity
   * Returns null if any required mapping fails
   */
  private convertDataLinkProperty(
    property: DataLinkProperty,
    fileSystemId: number,
  ): DataLink | null {
    try {
      // Get node systemIds from foreign key mapper
      const sourceNodeSystemId = this.getSpfModuleSystemId(
        property.sourceInstanceId,
      );
      const destinationNodeSystemId = this.getSpfModuleSystemId(
        property.destinationInstanceId,
      );

      // Check if module mappings failed
      if (sourceNodeSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map source module instance ID ${property.sourceInstanceId} for data link`,
          action: 'source_module_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      if (destinationNodeSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map destination module instance ID ${property.destinationInstanceId} for data link`,
          action: 'destination_module_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      // Get port systemIds using the new ForeignKeyMapper methods
      const sourcePortSystemId = this.getSourcePortSystemId(
        sourceNodeSystemId,
        property.sourcePortId,
      );
      const destinationPortSystemId = this.getDestinationPortSystemId(
        destinationNodeSystemId,
        property.destinationPortId,
      );

      // Check if port mappings failed
      if (sourcePortSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map source port ID ${property.sourcePortId} for module ${sourceNodeSystemId} in data link`,
          action: 'source_port_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      if (destinationPortSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map destination port ID ${property.destinationPortId} for module ${destinationNodeSystemId} in data link`,
          action: 'destination_port_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      // Create DataLink entity
      return new DataLink(
        0, // systemId - Will be generated during insertion
        sourceNodeSystemId,
        destinationNodeSystemId,
        sourcePortSystemId,
        destinationPortSystemId,
        property.isInterGraph, // Use the calculated value from parser
        fileSystemId, // Associate with the file being uploaded
      );
    } catch (error) {
      this.logger?.logWarn({
        msg: `Unexpected error converting data link (${property.sourceInstanceId}:${property.sourcePortId}->${property.destinationInstanceId}:${property.destinationPortId}): ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'data_link_conversion_error',
        component: 'DataLinkBuilder',
        tag: 'data-link-building',
        timestamp: new Date(),
      });
      return null;
    }
  }

  /**
   * Get module instance systemId from foreign key mapper
   */
  private getSpfModuleSystemId(instanceId: number): number | null {
    const systemId = this.foreignKeyMapper.getSpfModuleSystemId(
      asNaturalId(instanceId),
    );
    return systemId || null;
  }

  /**
   * Get source port systemId from foreign key mapper
   * Source ports are OUTPUT ports (data flows OUT from source)
   */
  private getSourcePortSystemId(
    moduleSystemId: number,
    portNaturalId: number,
  ): number | null {
    const systemId = this.foreignKeyMapper.getOutputPortSystemId(
      asSystemId(moduleSystemId),
      asNaturalId(portNaturalId),
    );
    return systemId || null;
  }

  /**
   * Get destination port systemId from foreign key mapper
   * Destination ports are INPUT ports (data flows INTO destination)
   */
  private getDestinationPortSystemId(
    moduleSystemId: number,
    portNaturalId: number,
  ): number | null {
    const systemId = this.foreignKeyMapper.getInputPortSystemId(
      asSystemId(moduleSystemId),
      asNaturalId(portNaturalId),
    );
    return systemId || null;
  }
}
