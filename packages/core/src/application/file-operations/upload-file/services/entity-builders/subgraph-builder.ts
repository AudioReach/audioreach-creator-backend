import {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {SubgraphProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Builder for converting SubgraphProperty data to Subgraph domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class SubgraphBuilder {
  constructor(private readonly logger?: Logger) {}

  /**
   * Build Subgraph entities from subgraph properties
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  async buildSubgraphs(
    subgraphProperties: SubgraphProperty[],
    fileSystemId: number,
  ): Promise<Subgraph[]> {
    // Input validation
    if (!subgraphProperties || subgraphProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No subgraph properties provided for building',
        action: 'no_subgraph_properties',
        component: 'SubgraphBuilder',
        tag: 'subgraph-building',
        timestamp: new Date(),
      });
      return [];
    }

    // Direct conversion logic
    const subgraphs: Subgraph[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < subgraphProperties.length; i++) {
      try {
        const subgraph = this.convertSubgraphProperty(
          subgraphProperties[i],
          fileSystemId,
        );
        subgraphs.push(subgraph);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert subgraph property ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'subgraph_conversion_failed',
          component: 'SubgraphBuilder',
          tag: 'subgraph-building',
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} subgraphs successfully, ${errorCount} failed`,
      action: 'subgraph_conversion_complete',
      component: 'SubgraphBuilder',
      tag: 'subgraph-building',
      timestamp: new Date(),
    });

    return subgraphs;
  }

  /**
   * Convert single SubgraphProperty to Subgraph entity
   */
  private convertSubgraphProperty(
    property: SubgraphProperty,
    fileSystemId: number,
  ): Subgraph {
    // Create Subgraph entity
    return new Subgraph({
      systemId: 0, // Will be generated during insertion
      naturalId: property.subgraphId, // Use the subgraphId from the property
      name: `Subgraph_${property.subgraphId}`, //TODO: init from workspace file.
      isExported: false, // Default value, could be derived from properties
      fileSystemId: fileSystemId,
      // vcpmDataInstance will be handled separately if needed
    });
  }
}
