/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Container} from '../../../../../domain/entities/usecase-data/container/container.js';
import {ContainerPropertyValue} from '../../../../../domain/entities/usecase-data/container/value-objects/container-property.js';
import type {AcdbContainerProperties} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import type {BuildResult} from '../../types/issue-collection.js';
import type {Issue} from '../../../../../shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../shared/issues/index.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';
import {CONTAINER_PROP_ID_PROC_DOMAIN} from '../../../shared/constants/spf-ids.js';

/**
 * Result of container building including processor ID mapping
 */
export interface ContainerBuildResult extends BuildResult<Container> {
  /** Map of containerId to processorId extracted from container properties */
  containerProcessorMap: Map<number, number>;
}

/**
 * Builder for converting ContainerProperty data to Container domain entities.
 * Simplified sequential implementation similar to SubgraphBuilder.
 */
export class ContainerBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build Container entities from container properties with system IDs assigned
   * Main API method similar to SubgraphBuilder.buildSubgraphs()
   */
  async buildContainers(
    containerProperties: AcdbContainerProperties[],
    fileSystemId: number,
  ): Promise<ContainerBuildResult> {
    // Input validation
    if (!containerProperties || containerProperties.length === 0) {
      return {
        entities: [],
        issues: [],
        containerProcessorMap: new Map(),
      };
    }

    // Step 1: Build entities (systemId = 0) and extract processor IDs
    const result = this.buildSequential(containerProperties);

    // Step 2: Assign system IDs to all successfully built entities
    if (result.entities.length > 0) {
      await this.assignSystemIds(result.entities, fileSystemId);
    }

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} containers with system IDs assigned, ${result.issues.length} failed, extracted ${result.containerProcessorMap.size} processor mappings`,
      action: 'container_building_complete',
      component: 'ContainerBuilder',
      tag: 'container-building',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Assign system IDs to containers.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param containers - Containers with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    containers: Container[],
    fileSystemId: number,
  ): Promise<void> {
    for (const container of containers) {
      // Assign file system ID
      container.fileSystemId = fileSystemId;

      // Assign system ID to container
      container.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store container mapping immediately
      this.foreignKeyMapper.addContainerMapping(
        asNaturalId(container.containerId),
        asSystemId(container.systemId),
      );
    }
  }

  /**
   * Build containers sequentially in the main thread
   * Creates objects with systemId = 0 and fileSystemId = 0 (to be assigned later)
   * Also extracts processor IDs from container properties
   */
  private buildSequential(
    acdbContainerPropertyData: AcdbContainerProperties[],
  ): ContainerBuildResult {
    // Direct conversion logic
    const containers: Container[] = [];
    const issues: Issue[] = [];
    const containerProcessorMap = new Map<number, number>();

    for (const acdbContainer of acdbContainerPropertyData) {
      try {
        const container = this.convertAcdbContainer(acdbContainer);
        containers.push(container);

        // Extract processor ID from container properties
        const processorId = this.extractProcessorId(acdbContainer);
        if (processorId !== null) {
          containerProcessorMap.set(acdbContainer.containerId, processorId);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const issue = this.convertToEntityBuildIssue(
          errorMessage,
          acdbContainer.containerId,
        );
        issues.push(issue);

        this.logger?.logWarn({
          msg: `Failed to convert container property (ID: ${acdbContainer.containerId}): ${errorMessage}`,
          action: 'container_conversion_failed',
          component: 'ContainerBuilder',
          tag: 'container-building',
          timestamp: new Date(),
        });
      }
    }

    return {
      entities: containers,
      issues,
      containerProcessorMap,
    };
  }

  /**
   * Convert single ContainerProperty to Container entity
   */
  private convertAcdbContainer(
    acdbContainer: AcdbContainerProperties,
  ): Container {
    // Create Container entity
    const container = new Container(
      0, // systemId - Placeholder - will be assigned before insertion
      acdbContainer.containerId, // Use the containerId from the property
      0, // containerTypeSystemId - TODO: resolve from CONTAINER_PROP_ID_CAPABILITY_LIST → container_types.value lookup
      0, // fileSystemId - Placeholder - will be assigned before insertion
    );

    // Add properties to the container
    for (const [propertyId, propertyData] of acdbContainer.properties) {
      // Resolve property ID to system ID using foreign key mapper
      const propertySystemId =
        this.foreignKeyMapper.getContainerPropertyDefinitionSystemId(
          asNaturalId(propertyId),
        );

      if (propertySystemId === undefined) {
        this.logger?.logWarn({
          msg: `Container property definition not found for propertyId ${propertyId} in container ${acdbContainer.containerId}`,
          action: 'property_definition_not_found',
          component: 'ContainerBuilder',
          tag: 'container-building',
          timestamp: new Date(),
        });
        // Skip this property if definition not found
        continue;
      }

      const containerPropertyValue = new ContainerPropertyValue(
        propertySystemId,
        propertyData,
      );
      container.properties.set(propertySystemId, containerPropertyValue);
    }

    return container;
  }

  /**
   * Extract processor ID from container properties
   * Returns null if processor domain property is not found
   */
  private extractProcessorId(
    acdbContainer: AcdbContainerProperties,
  ): number | null {
    const procDomainData = acdbContainer.properties.get(
      CONTAINER_PROP_ID_PROC_DOMAIN,
    );

    if (!procDomainData || procDomainData.length < 4) {
      return null;
    }

    // Read uint32 from property data (little-endian)
    const view = new DataView(
      procDomainData.buffer,
      procDomainData.byteOffset,
      procDomainData.byteLength,
    );
    return view.getUint32(0, true);
  }

  private convertToEntityBuildIssue(
    errorMessage: string,
    containerId?: number,
  ): Issue {
    return {
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message: errorMessage,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Container,
        systemId: containerId ?? 0,
      },
    };
  }
}
