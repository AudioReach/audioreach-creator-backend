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
import type {
  BuildResult,
  EntityBuildIssue,
} from '../../types/issue-collection.js';
import {ENTITY_TYPES, ISSUE_SEVERITY} from '../../types/issue-collection.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

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
  ): Promise<BuildResult<Container>> {
    // Input validation
    if (!containerProperties || containerProperties.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Step 1: Build entities (systemId = 0)
    const result = this.buildSequential(containerProperties);

    // Step 2: Assign system IDs to all successfully built entities
    if (result.entities.length > 0) {
      await this.assignSystemIds(result.entities, fileSystemId);
    }

    this.logger?.logInfo({
      msg: `Successfully built ${result.successCount} containers with system IDs assigned, ${result.errorCount} failed`,
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
   */
  private buildSequential(
    acdbContainerPropertyData: AcdbContainerProperties[],
  ): BuildResult<Container> {
    // Direct conversion logic
    const containers: Container[] = [];
    const issues: EntityBuildIssue[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const acdbContainer of acdbContainerPropertyData) {
      try {
        const container = this.convertAcdbContainer(acdbContainer);
        containers.push(container);
        successCount++;
      } catch (error) {
        errorCount++;
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
      successCount,
      errorCount,
      warningCount: 0,
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
      '', // TODO: insert from property later
      0, // fileSystemId - Placeholder - will be assigned before insertion
    );

    // Add properties to the container
    for (const [propertyId, propertyData] of acdbContainer.properties) {
      const containerPropertyValue = new ContainerPropertyValue(
        propertyId, //TODO: insert from propertydefinition systemId later
        propertyData,
      );
      container.properties.set(propertyId, containerPropertyValue);
    }

    return container;
  }

  private convertToEntityBuildIssue(
    errorMessage: string,
    containerId?: number,
  ): EntityBuildIssue {
    return {
      entityType: ENTITY_TYPES.CONTAINER,
      severity: ISSUE_SEVERITY.ERROR,
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message: errorMessage,
      entityData:
        containerId === undefined ? undefined : `containerId: ${containerId}`,
    };
  }
}
