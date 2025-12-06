import {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {ControlLink as ControlLinkProperty} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

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
   */
  buildControlLinks(
    controlLinkProperties: ControlLinkProperty[],
  ): ControlLink[] {
    // Input validation
    if (!controlLinkProperties || controlLinkProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No control link properties provided for building',
        action: 'no_control_link_properties',
        component: 'ControlLinkBuilder',
        tag: 'control-link-building',
        timestamp: new Date(),
      });
      return [];
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

    // STEP 2: Build ControlLink objects only for unique properties (Efficient Processing)
    const controlLinks: ControlLink[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const property of uniqueProperties.values()) {
      try {
        const controlLink = this.convertControlLinkProperty(property);
        controlLinks.push(controlLink);
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

    // STEP 3: Performance and results logging
    this.logger?.logInfo({
      msg: `Control link building complete: ${controlLinkProperties.length} total → ${uniqueProperties.size} unique → ${successCount} successful, ${errorCount} failed (${duplicateCount} duplicates eliminated)`,
      action: 'control_link_building_complete',
      component: 'ControlLinkBuilder',
      tag: 'control-link-building',
      timestamp: new Date(),
    });

    return controlLinks;
  }

  /**
   * Convert single ControlLinkProperty to ControlLink entity
   */
  private convertControlLinkProperty(
    property: ControlLinkProperty,
  ): ControlLink {
    // Get node systemIds from foreign key mapper
    const peerNodeASystemId = this.getModuleInstanceSystemId(
      property.peer1InstanceId,
    );
    const peerNodeBSystemId = this.getModuleInstanceSystemId(
      property.peer2InstanceId,
    );

    // For now, use port IDs directly as port systemIds
    // TODO: Implement proper port systemId mapping when port creation is implemented
    const nodeAPortSystemId = property.peer1PortId;
    const nodeBPortSystemId = property.peer2PortId;

    // Create ControlLink entity
    return new ControlLink(
      0, // systemId - Will be generated during insertion
      peerNodeASystemId,
      peerNodeBSystemId,
      nodeAPortSystemId,
      nodeBPortSystemId,
      0, // heapId - Default to 0, could be enhanced with actual heap data
      false, // isInterGraph - Default to false, could be enhanced with actual logic
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
