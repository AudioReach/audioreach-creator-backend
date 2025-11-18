import {
  UseCase,
  type KeyVectorInput,
} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseEntry} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Builder for converting UsecaseEntry data to UseCase domain entities.
 * Handles conversion of KeyValuePairList to KvData with foreign key mapping.
 * Simplified sequential implementation similar to KeyDefinitionBuilder.
 */
export class UsecaseBuilder {
  constructor(
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build UseCase entities from usecase entries
   * Main API method similar to KeyDefinitionBuilder.buildKeyDefinitions()
   */
  async buildUsecases(
    usecaseEntries: UsecaseEntry[],
    fileSystemId: number,
  ): Promise<UseCase[]> {
    // Input validation
    if (!usecaseEntries || usecaseEntries.length === 0) {
      this.logger?.logDebug({
        msg: 'No usecase entries provided for building',
        action: 'no_usecase_entries',
        component: 'UsecaseBuilder',
        tag: 'usecase-building',
        timestamp: new Date(),
      });
      return [];
    }

    // Direct conversion logic
    const usecases: UseCase[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < usecaseEntries.length; i++) {
      try {
        const usecase = this.convertUsecaseEntry(
          usecaseEntries[i],
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
      msg: `Converted ${successCount} usecases successfully, ${errorCount} failed`,
      action: 'usecase_conversion_complete',
      component: 'UsecaseBuilder',
      tag: 'usecase-building',
      timestamp: new Date(),
    });

    return usecases;
  }

  /**
   * Convert single UsecaseEntry to UseCase entity
   */
  private convertUsecaseEntry(
    entry: UsecaseEntry,
    index: number,
    fileSystemId: number,
  ): UseCase {
    // Convert KeyValuePairList to KeyVectorInput
    const keyVector = this.convertToKeyVector(entry, index);

    // Create UseCase entity
    return new UseCase({
      systemId: 0, // Will be generated during insertion
      fileSystemId: fileSystemId, // Use actual file system ID from database
      keyVector: keyVector,
      alias: undefined, // Could be derived from sgList if needed
      aliasId: undefined,
      categories: undefined, // Convert sgList to string categories
    });
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
    let mappedCount = 0;
    let unmappedCount = 0;

    // Convert each key-value pair to its corresponding value systemId
    for (const keyValue of entry.keyValuePairList.keyValueList) {
      try {
        const valueSystemId = this.foreignKeyMapper?.getValueSystemId(
          keyValue.keyId,
          keyValue.value,
        );

        if (valueSystemId) {
          valueSystemIds.push(valueSystemId);
          mappedCount++;
        } else {
          unmappedCount++;
          this.logger?.logWarn({
            msg: `No foreign key mapping found for key-value pair (${keyValue.keyId}:${keyValue.value}) in usecase ${index}`,
            action: 'missing_value_mapping',
            component: 'UsecaseBuilder',
            tag: 'foreign-key-mapping',
            timestamp: new Date(),
          });
        }
      } catch (error) {
        unmappedCount++;
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

    this.logger?.logDebug({
      msg: `Mapped ${mappedCount} value systemIds, ${unmappedCount} failed for usecase ${index}`,
      action: 'key_vector_mapping_complete',
      component: 'UsecaseBuilder',
      tag: 'usecase-building',
      timestamp: new Date(),
    });

    return {
      valueSystemIds,
    };
  }
}
