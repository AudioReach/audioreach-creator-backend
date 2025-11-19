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

    // Direct conversion logic
    const dataLinks: DataLink[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < dataLinkProperties.length; i++) {
      try {
        const dataLink = this.convertDataLinkProperty(dataLinkProperties[i]);
        dataLinks.push(dataLink);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert data link property ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'data_link_conversion_failed',
          component: 'DataLinkBuilder',
          tag: 'data-link-building',
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} data links successfully, ${errorCount} failed`,
      action: 'data_link_conversion_complete',
      component: 'DataLinkBuilder',
      tag: 'data-link-building',
      timestamp: new Date(),
    });

    return dataLinks;
  }

  /**
   * Convert single DataLinkProperty to DataLink entity
   */
  private convertDataLinkProperty(property: DataLinkProperty): DataLink {
    // Get node systemIds from foreign key mapper
    const sourceNodeSystemId = this.getModuleInstanceSystemId(
      property.sourceInstanceId,
    );
    const destinationNodeSystemId = this.getModuleInstanceSystemId(
      property.destinationInstanceId,
    );

    // For now, use port IDs directly as port systemIds
    // TODO: Implement proper port systemId mapping when port creation is implemented
    const sourcePortSystemId = property.sourcePortId;
    const destinationPortSystemId = property.destinationPortId;

    // Create DataLink entity
    return new DataLink(
      0, // systemId - Will be generated during insertion
      sourceNodeSystemId,
      destinationNodeSystemId,
      sourcePortSystemId,
      destinationPortSystemId,
      property.isInterGraph, // Use the calculated value from parser
    );
  }

  /**
   * Get module instance systemId from foreign key mapper
   */
  private getModuleInstanceSystemId(instanceId: number): number {
    const systemId =
      this.foreignKeyMapper.getModuleInstanceSystemId(instanceId);
    if (!systemId) {
      throw new Error(
        `No module instance systemId mapping found for instanceId ${instanceId}`,
      );
    }
    return systemId;
  }
}
