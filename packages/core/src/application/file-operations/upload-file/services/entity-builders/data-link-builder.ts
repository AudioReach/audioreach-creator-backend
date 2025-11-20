import {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {DataLink as DataLinkProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Builder for converting DataLink property data to DataLink domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class DataLinkBuilder {
  constructor(
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build DataLink entities from data link properties
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  async buildDataLinks(
    dataLinkProperties: DataLinkProperty[],
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

    // Direct conversion logic with detailed error tracking
    const dataLinks: DataLink[] = [];
    let successCount = 0;

    for (let i = 0; i < dataLinkProperties.length; i++) {
      const property = dataLinkProperties[i];
      const dataLink = this.convertDataLinkProperty(property);

      if (dataLink !== null) {
        dataLinks.push(dataLink);
        successCount++;
      } else {
        // The specific failure reason was already logged in convertDataLinkProperty
        // We just increment the appropriate counter here
        // Note: We can't easily distinguish the failure type here without duplicating logic,
        // but the detailed logs in convertDataLinkProperty provide the specifics
      }
    }

    const totalFailures = dataLinkProperties.length - successCount;

    this.logger?.logInfo({
      msg: `Data link conversion complete: ${successCount} successful, ${totalFailures} failed out of ${dataLinkProperties.length} total`,
      action: 'data_link_conversion_complete',
      component: 'DataLinkBuilder',
      tag: 'data-link-building',
      timestamp: new Date(),
    });

    return dataLinks;
  }

  /**
   * Convert single DataLinkProperty to DataLink entity
   * Returns null if any required mapping fails
   */
  private convertDataLinkProperty(property: DataLinkProperty): DataLink | null {
    try {
      // Get node systemIds from foreign key mapper
      const sourceNodeSystemId = this.getModuleInstanceSystemId(
        property.sourceInstanceId,
      );
      const destinationNodeSystemId = this.getModuleInstanceSystemId(
        property.destinationInstanceId,
      );

      // Check if module mappings failed
      if (sourceNodeSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map source module instance ID ${property.sourceInstanceId} for data link ${property.naturalKeyHash}`,
          action: 'source_module_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      if (destinationNodeSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map destination module instance ID ${property.destinationInstanceId} for data link ${property.naturalKeyHash}`,
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
          msg: `Failed to map source port ID ${property.sourcePortId} for module ${sourceNodeSystemId} in data link ${property.naturalKeyHash}`,
          action: 'source_port_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      if (destinationPortSystemId === null) {
        this.logger?.logWarn({
          msg: `Failed to map destination port ID ${property.destinationPortId} for module ${destinationNodeSystemId} in data link ${property.naturalKeyHash}`,
          action: 'destination_port_mapping_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
        return null;
      }

      // Create DataLink entity with naturalKeyHash from parsed ACDB
      return new DataLink(
        0, // systemId - Will be generated during insertion
        sourceNodeSystemId,
        destinationNodeSystemId,
        sourcePortSystemId,
        destinationPortSystemId,
        property.isInterGraph, // Use the calculated value from parser
        property.naturalKeyHash, // Use pre-computed hash from parsed ACDB
      );
    } catch (error) {
      this.logger?.logWarn({
        msg: `Unexpected error converting data link ${property.naturalKeyHash}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  private getModuleInstanceSystemId(instanceId: number): number | null {
    const systemId =
      this.foreignKeyMapper.getModuleInstanceSystemId(instanceId);
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
      moduleSystemId,
      portNaturalId,
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
      moduleSystemId,
      portNaturalId,
    );
    return systemId || null;
  }
}
