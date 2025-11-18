import {
  BulkDataLinkInsertResult,
  DataLink,
  NaturalIdMapping,
  DataLinkInsertResult,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {DataLinkRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of DataLink entities.
 *
 * Process:
 * 1. Batch insert all DataLinks
 * 2. Query back using composite natural key
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
    const successfulNaturalKeys = insertResult.succeeded.map(row =>
      this.buildNaturalKeyFromRow(row),
    );
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
    };
  }

  /**
   * Build natural key from database row
   */
  private buildNaturalKeyFromRow(
    row: QueryDeepPartialEntity<DataLinkRow>,
  ): string {
    return `${row.sourceNodeSystemId}:${row.sourcePortSystemId}->${row.destinationNodeSystemId}:${row.destinationPortSystemId}`;
  }

  /**
   * Query back DataLink systemIds using natural keys.
   *
   * @param naturalKeys - Array of natural keys to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackDataLinks(
    naturalKeys: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (naturalKeys.length === 0) return [];

    // Parse natural keys to build query conditions
    const conditions = naturalKeys.map(key => {
      const [source, dest] = key.split('->');
      const [sourceNodeId, sourcePortId] = source.split(':');
      const [destNodeId, destPortId] = dest.split(':');
      return {
        sourceNodeSystemId: parseInt(sourceNodeId),
        sourcePortSystemId: parseInt(sourcePortId),
        destinationNodeSystemId: parseInt(destNodeId),
        destinationPortSystemId: parseInt(destPortId),
      };
    });

    const results = [];
    for (const condition of conditions) {
      const result = await this.manager
        .createQueryBuilder('DataLink', 'dl')
        .select([
          'dl.systemId',
          'dl.sourceNodeSystemId',
          'dl.sourcePortSystemId',
          'dl.destinationNodeSystemId',
          'dl.destinationPortSystemId',
        ])
        .where('dl.sourceNodeSystemId = :sourceNodeId', {
          sourceNodeId: condition.sourceNodeSystemId,
        })
        .andWhere('dl.sourcePortSystemId = :sourcePortId', {
          sourcePortId: condition.sourcePortSystemId,
        })
        .andWhere('dl.destinationNodeSystemId = :destNodeId', {
          destNodeId: condition.destinationNodeSystemId,
        })
        .andWhere('dl.destinationPortSystemId = :destPortId', {
          destPortId: condition.destinationPortSystemId,
        })
        .getOne();

      if (result) {
        const naturalKey = this.buildNaturalKeyFromRow(result);
        results.push({
          naturalId: naturalKey,
          systemId: result.systemId,
        });
      }
    }

    return results;
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
      insertResult.failed.map(f => [
        this.buildNaturalKeyFromRow(f.row),
        f.error,
      ]),
    );

    const results: DataLinkInsertResult[] = [];

    for (const dataLink of dataLinks) {
      const naturalKey = `${dataLink.sourceNodeSystemId}:${dataLink.sourcePortSystemId}->${dataLink.destinationNodeSystemId}:${dataLink.destinationPortSystemId}`;
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
