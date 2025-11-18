import {Container} from '../../../../../domain/entities/usecase-data/container/container.js';
import type {ContainerProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Builder for converting ContainerProperty data to Container domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class ContainerBuilder {
  constructor(private readonly logger?: Logger) {}

  /**
   * Build Container entities from container properties
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  async buildContainers(
    containerProperties: ContainerProperty[],
    fileSystemId: number,
  ): Promise<Container[]> {
    // Input validation
    if (!containerProperties || containerProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No container properties provided for building',
        action: 'no_container_properties',
        component: 'ContainerBuilder',
        tag: 'container-building',
        timestamp: new Date(),
      });
      return [];
    }

    // Direct conversion logic
    const containers: Container[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < containerProperties.length; i++) {
      try {
        const container = this.convertContainerProperty(
          containerProperties[i],
          fileSystemId,
        );
        containers.push(container);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert container property ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'container_conversion_failed',
          component: 'ContainerBuilder',
          tag: 'container-building',
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} containers successfully, ${errorCount} failed`,
      action: 'container_conversion_complete',
      component: 'ContainerBuilder',
      tag: 'container-building',
      timestamp: new Date(),
    });

    return containers;
  }

  /**
   * Convert single ContainerProperty to Container entity
   */
  private convertContainerProperty(
    property: ContainerProperty,
    fileSystemId: number,
  ): Container {
    // Create Container entity
    const container = new Container(
      0, // systemId - Will be generated during insertion
      property.containerId, // naturalId - Use the containerId from the property
      '', // TODO: insert from property later
      fileSystemId,
    );

    // Add container properties if needed
    // The properties Map is already initialized in the Container constructor
    // Additional property processing can be added here if needed

    return container;
  }
}
