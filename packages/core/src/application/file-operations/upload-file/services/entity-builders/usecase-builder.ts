/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  UseCase,
  type KeyVectorInput,
} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseEntry} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {SubgraphDataChunk} from '../../../shared/acdb-chunks/subgraph-data-chunk.js';
import type {SubgraphPairDataChunk} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {asNaturalId} from '../../../../../shared/types/branded-ids.js';

/**
 * Builder for converting UsecaseEntry data to UseCase domain entities.
 * Handles conversion of KeyValuePairList to KvData with foreign key mapping.
 * Simplified sequential implementation similar to DataLinkBuilder.
 */
export class UsecaseBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly parsedAcdb: ParsedAcdb,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build UseCase entities from usecase entries with system IDs assigned
   * Main API method similar to DataLinkBuilder.buildDataLinks()
   */
  async buildUsecases(
    usecaseEntries: UsecaseEntry[],
    fileSystemId: number,
  ): Promise<UseCase[]> {
    // Input validation
    if (!usecaseEntries || usecaseEntries.length === 0) {
      return [];
    }

    // Direct conversion logic with system ID assignment
    const usecases: UseCase[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const [i, usecaseEntry] of usecaseEntries.entries()) {
      try {
        const usecase = await this.convertUsecaseEntry(
          usecaseEntry,
          i,
          fileSystemId,
        );
        usecases.push(usecase);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert usecase entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'usecase_conversion_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} usecases successfully, ${errorCount} failed, system IDs assigned`,
      action: 'usecase_conversion_complete',
      component: 'UsecaseBuilder',
      tag: 'usecase-building',
      timestamp: new Date(),
    });

    return usecases;
  }

  /**
   * Convert single UsecaseEntry to UseCase entity with system ID assigned
   */
  private async convertUsecaseEntry(
    entry: UsecaseEntry,
    index: number,
    fileSystemId: number,
  ): Promise<UseCase> {
    // Convert KeyValuePairList to KeyVectorInput
    const keyVector = this.convertToKeyVector(entry, index);

    // Assign system ID using foreign key mapper
    const systemId = await this.idGenerator.getNextId(fileSystemId);

    // Create UseCase entity with assigned system ID
    const useCase = new UseCase({
      systemId: systemId,
      fileSystemId: fileSystemId, // Use actual file system ID from database
      keyVector: keyVector,
      alias: undefined, // Could be derived from sgList if needed
      aliasId: undefined,
      categories: undefined, // Convert sgList to string categories
    });

    // Add module system IDs from subgraphs
    const moduleSystemIds = this.getModuleSystemIdsFromSubgraphs(entry.sgList);
    if (moduleSystemIds.length > 0) {
      try {
        useCase.addModuleSystemIds(moduleSystemIds);
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to add module system IDs to usecase ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'add_module_system_ids_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    // Add filtered datalink system IDs based on usecase subgraphs and subgraph pairs
    const dataLinkSystemIds = this.getFilteredDataLinkSystemIds(entry);
    if (dataLinkSystemIds.length > 0) {
      try {
        useCase.addDataLinkSystemIds(dataLinkSystemIds);
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to add datalink system IDs to usecase ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'add_datalink_system_ids_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    return useCase;
  }

  /**
   * Convert KeyValuePairList to KeyVectorInput using foreign key mappings
   */
  private convertToKeyVector(
    entry: UsecaseEntry,
    index: number,
  ): KeyVectorInput {
    if (
      !entry.keyValuePairList?.keyValueList ||
      entry.keyValuePairList.keyValueList.length === 0
    ) {
      throw new Error(`No key-value pairs found in usecase entry ${index}`);
    }

    const valueSystemIds: number[] = [];

    // Convert each key-value pair to its corresponding value systemId
    for (const keyValue of entry.keyValuePairList.keyValueList) {
      try {
        const valueSystemId = this.foreignKeyMapper?.getValueSystemId(
          asNaturalId(keyValue.keyId),
          asNaturalId(keyValue.value),
        );

        if (valueSystemId) {
          valueSystemIds.push(valueSystemId);
        } else {
          this.logger?.logWarn({
            msg: `No foreign key mapping found for key-value pair (${keyValue.keyId}:${keyValue.value}) in usecase ${index}`,
            action: 'missing_value_mapping',
            component: 'UsecaseBuilder',
            tag: 'foreign-key-mapping',
            timestamp: new Date(),
          });
        }
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to map key-value pair (${keyValue.keyId}:${keyValue.value}) in usecase ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'key_value_mapping_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    if (valueSystemIds.length === 0) {
      throw new Error(
        `No valid value systemIds found for usecase entry ${index}. All ${entry.keyValuePairList.keyValueList.length} key-value pairs failed to map.`,
      );
    }

    return {
      valueSystemIds,
    };
  }

  /**
   * Get module system IDs from all modules in the specified subgraphs
   */
  private getModuleSystemIdsFromSubgraphs(sgList: number[]): number[] {
    const subgraphDataChunk = this.parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );
    if (!subgraphDataChunk) {
      return [];
    }

    const moduleSystemIds: number[] = [];
    const allModules = subgraphDataChunk.getAllModules();

    // Filter modules that belong to the specified subgraphs
    for (const moduleInfo of allModules) {
      if (sgList.includes(moduleInfo.subgraphId)) {
        for (const moduleInstance of moduleInfo.spfModules) {
          const systemId = this.foreignKeyMapper.getSpfModuleSystemId(
            asNaturalId(moduleInstance.instanceId),
          );
          if (systemId) {
            moduleSystemIds.push(systemId);
          }
        }
      }
    }

    return moduleSystemIds;
  }

  /**
   * Get filtered datalink system IDs based on usecase subgraphs and subgraph pairs
   */
  private getFilteredDataLinkSystemIds(entry: UsecaseEntry): number[] {
    const subgraphDataChunk = this.parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );
    const subgraphPairDataChunk =
      this.parsedAcdb.getChunk<SubgraphPairDataChunk>(
        CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
      );

    if (!subgraphDataChunk) {
      return [];
    }

    const dataLinkSystemIds: number[] = [];

    // Get data links from subgraphs present in this usecase (intra-subgraph links)
    const usecaseDataLinks = subgraphDataChunk.getAllDataLinks(entry.sgList);

    // Process intra-subgraph data links (isInterGraph = false)
    for (const dataLink of usecaseDataLinks) {
      if (dataLink.isInterGraph) {
        continue;
      }

      // Get system ID for this data link
      const systemId = this.foreignKeyMapper.getDataLinkSystemId(
        dataLink.sourceInstanceId,
        dataLink.sourcePortId,
        dataLink.destinationInstanceId,
        dataLink.destinationPortId,
      );
      if (systemId) {
        dataLinkSystemIds.push(systemId);
      }
    }

    // Get data links from subgraph pairs (inter-subgraph links)
    if (subgraphPairDataChunk && entry.sgPairList.length > 0) {
      const subgraphPairDataLinks =
        subgraphPairDataChunk.getDataLinksForSubgraphPairs(entry.sgPairList);

      // Process inter-subgraph data links (isInterGraph = true)
      for (const dataLink of subgraphPairDataLinks) {
        // Get system ID for this data link
        const systemId = this.foreignKeyMapper.getDataLinkSystemId(
          dataLink.sourceInstanceId,
          dataLink.sourcePortId,
          dataLink.destinationInstanceId,
          dataLink.destinationPortId,
        );
        if (systemId) {
          dataLinkSystemIds.push(systemId);
        } else {
          // TODO: Send validation error back
        }
      }
    }

    return dataLinkSystemIds;
  }
}
