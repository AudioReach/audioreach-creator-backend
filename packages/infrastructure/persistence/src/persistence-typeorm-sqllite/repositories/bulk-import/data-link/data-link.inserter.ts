import {
  type BulkDataLinkInsertResult,
  DataLink,
  type NaturalIdMapping,
  type DataLinkInsertResult,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, type BatchInsertResult} from '../batch-inserter.js';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import type {DataLinkRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of DataLink entities.
 *
 * Process:
 * 1. Batch insert all DataLinks
 * 2. Query back using naturalKeyHash
 * 3. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class DataLinkInserter extends BaseInserter<
  Omit<DataLink, 'systemId'>,
  BulkDataLinkInsertResult,
  'DATA_LINK'
> {
  /**
   * Insert DataLinks in bulk.
   *
   * @param dataLinks - DataLink domain entities without systemId
   * @returns Bulk insert result with natural key mappings and errors
   */
  async insert(
    dataLinks: readonly Omit<DataLink, 'systemId'>[],
  ): Promise<BulkDataLinkInsertResult> {
    // Early return for empty input
    if (dataLinks.length === 0) {
      return {
        results: [],
      };
    }

    // ============================================
    // Batch Insert DataLinks
    // ============================================
    const dataLinkRows = dataLinks.map(dl => this.toDataLinkRow(dl));
    const insertResult = await BatchInserter.insert(
      this.manager,
      'DataLink',
      dataLinkRows,
    );

    // ============================================
    // Query Back DataLink SystemIds
    // ============================================
    const successfulNaturalKeys = insertResult.succeeded
      .map(row => row.naturalKeyHash)
      .filter((hash): hash is string => typeof hash === 'string');
    const mappings = await this.queryBackDataLinks(successfulNaturalKeys);

    // ============================================
    // Build Results
    // ============================================
    return this.buildResults(dataLinks, mappings, insertResult);
  }

  /**
   * Convert DataLink domain entity to database row
   */
  private toDataLinkRow(
    dataLink: Omit<DataLink, 'systemId'>,
  ): QueryDeepPartialEntity<DataLinkRow> {
    return {
      sourceNodeSystemId: dataLink.sourceNodeSystemId,
      destinationNodeSystemId: dataLink.destinationNodeSystemId,
      sourcePortSystemId: dataLink.sourcePortSystemId,
      destinationPortSystemId: dataLink.destinationPortSystemId,
      isInterGraph: dataLink.isInterGraph,
      naturalKeyHash: dataLink.naturalKeyHash, // Now stored in DB for efficient querying
      fileSystemId: dataLink.fileSystemId, // Associate with file
    };
  }

  /**
   * Query back DataLink systemIds using naturalKeyHash.
   *
   * @param naturalKeys - Array of naturalKeyHash values to query
   * @returns Array of naturalKeyHash → systemId mappings
   */
  private async queryBackDataLinks(
    naturalKeys: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (naturalKeys.length === 0) return [];

    // Use efficient IN query with naturalKeyHash
    const results = await this.manager
      .createQueryBuilder('DataLink', 'dl')
      .select(['dl.systemId', 'dl.naturalKeyHash'])
      .where('dl.naturalKeyHash IN (:...naturalKeys)', {naturalKeys})
      .getMany();

    return results.map(result => ({
      naturalId: result.naturalKeyHash,
      systemId: result.systemId,
    }));
  }

  /**
   * Build results with mappings and errors
   */
  private buildResults(
    dataLinks: readonly Omit<DataLink, 'systemId'>[],
    mappings: NaturalIdMapping<string>[],
    insertResult: BatchInsertResult<QueryDeepPartialEntity<DataLinkRow>>,
  ): BulkDataLinkInsertResult {
    const mappingMap = new Map(mappings.map(m => [m.naturalId, m.systemId]));

    const failedMap = new Map(
      insertResult.failed
        .map(f => ({hash: f.row.naturalKeyHash, error: f.error}))
        .filter(
          (item): item is {hash: string; error: any} =>
            typeof item.hash === 'string',
        )
        .map(item => [item.hash, item.error]),
    );

    const results: DataLinkInsertResult[] = [];

    for (const dataLink of dataLinks) {
      const naturalKey = dataLink.naturalKeyHash;
      const systemId = mappingMap.get(naturalKey);
      const error = failedMap.get(naturalKey);

      if (systemId) {
        results.push({
          idMapping: {naturalId: naturalKey, systemId},
          success: true,
        });
      } else if (error) {
        results.push({
          error: this.buildError('DATA_LINK', naturalKey, error),
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
