/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {SubgraphPropertyData} from '../../../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import type {AcdbSubgraphProperties} from '../../../shared/acdb-chunks/spf-properties/types.js';
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
 * Builder for converting SubgraphProperty data to Subgraph domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class SubgraphBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build Subgraph entities from subgraph properties with system IDs assigned
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  async buildSubgraphs(
    subgraphProperties: AcdbSubgraphProperties[],
    fileSystemId: number,
  ): Promise<BuildResult<Subgraph>> {
    // Input validation
    if (!subgraphProperties || subgraphProperties.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Step 1: Build entities (systemId = 0)
    const result = this.buildSequential(subgraphProperties);

    // Step 2: Assign system IDs to all successfully built entities
    if (result.entities.length > 0) {
      await this.assignSystemIds(result.entities, fileSystemId);
    }

    this.logger?.logInfo({
      msg: `Successfully built ${result.successCount} subgraphs with system IDs assigned, ${result.errorCount} failed`,
      action: 'subgraph_building_complete',
      component: 'SubgraphBuilder',
      tag: 'subgraph-building',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Assign system IDs to subgraphs.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param subgraphs - Subgraphs with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    subgraphs: Subgraph[],
    fileSystemId: number,
  ): Promise<void> {
    for (const subgraph of subgraphs) {
      // Assign file system ID
      subgraph.fileSystemId = fileSystemId;

      // Assign system ID to subgraph
      subgraph.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store subgraph mapping immediately
      this.foreignKeyMapper.addSubgraphMapping(
        asNaturalId(subgraph.subgraphId),
        asSystemId(subgraph.systemId),
      );
    }
  }

  /**
   * Build subgraphs sequentially in the main thread
   * Creates objects with systemId = 0 and fileSystemId = 0 (to be assigned later)
   */
  private buildSequential(
    subgraphProperties: AcdbSubgraphProperties[],
  ): BuildResult<Subgraph> {
    // Direct conversion logic
    const subgraphs: Subgraph[] = [];
    const issues: EntityBuildIssue[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const subgraphProperty of subgraphProperties) {
      try {
        const subgraph = this.convertAcdbSubgraphPropertyData(subgraphProperty);
        subgraphs.push(subgraph);
        successCount++;
      } catch (error) {
        errorCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const issue = this.convertToEntityBuildIssue(
          errorMessage,
          subgraphProperty.subgraphId,
        );
        issues.push(issue);

        this.logger?.logWarn({
          msg: `Failed to convert subgraph property (ID: ${subgraphProperty.subgraphId}): ${errorMessage}`,
          action: 'subgraph_conversion_failed',
          component: 'SubgraphBuilder',
          tag: 'subgraph-building',
          timestamp: new Date(),
        });
      }
    }

    return {
      entities: subgraphs,
      issues,
      successCount,
      errorCount,
      warningCount: 0,
    };
  }

  /**
   * Convert single SubgraphProperty to Subgraph entity
   */
  private convertAcdbSubgraphPropertyData(
    subgraphPropertyData: AcdbSubgraphProperties,
  ): Subgraph {
    // Build property list, skipping any with unresolved definition IDs
    const properties: SubgraphPropertyData[] = [];
    for (const [propertyId, propertyData] of subgraphPropertyData.properties) {
      const propertySystemId =
        this.foreignKeyMapper.getSubgraphPropertyDefinitionSystemId(
          asNaturalId(propertyId),
        );

      if (propertySystemId === undefined) {
        this.logger?.logWarn({
          msg: `Subgraph property definition not found for propertyId ${propertyId} in subgraph ${subgraphPropertyData.subgraphId}`,
          action: 'property_definition_not_found',
          component: 'SubgraphBuilder',
          tag: 'subgraph-building',
          timestamp: new Date(),
        });
        continue;
      }

      properties.push(new SubgraphPropertyData(propertySystemId, propertyData));
    }

    return new Subgraph({
      systemId: 0, // Placeholder - will be assigned before insertion
      subgraphId: subgraphPropertyData.subgraphId,
      name: `Subgraph_${subgraphPropertyData.subgraphId}`, //TODO: init from workspace file.
      isExported: false,
      fileSystemId: 0, // Placeholder - will be assigned before insertion
      properties,
    });
  }

  private convertToEntityBuildIssue(
    errorMessage: string,
    subgraphId?: number,
  ): EntityBuildIssue {
    return {
      entityType: ENTITY_TYPES.SUBGRAPH,
      severity: ISSUE_SEVERITY.ERROR,
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message: errorMessage,
      entityData:
        subgraphId === undefined ? undefined : `subgraphId: ${subgraphId}`,
    };
  }
}
