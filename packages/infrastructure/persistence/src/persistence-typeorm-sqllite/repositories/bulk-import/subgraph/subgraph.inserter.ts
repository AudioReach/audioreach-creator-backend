import {BulkEntityInsertResult, Subgraph, NaturalIdMapping} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {SubgraphRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of Subgraph entities.
 *
 * Process:
 * 1. Batch insert all Subgraphs
 * 2. Query back using naturalId (natural key)
 * 3. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class SubgraphInserter extends BaseInserter<
  Omit<Subgraph, 'systemId'>,
  BulkEntityInsertResult<number>,
  string
> {
  /**
   * Insert Subgraphs in bulk.
   *
   * @param subgraphs - Subgraph domain entities without systemId
   * @returns Bulk insert result with natural key mappings and errors
   */
  async insert(
    subgraphs: readonly Omit<Subgraph, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Early return for empty input
    if (subgraphs.length === 0) {
      return {
        results: [],
      };
    }

    // ============================================
    // Batch Insert Subgraphs
    // ============================================
    const subgraphRows = subgraphs.map(s => this.toSubgraphRow(s));
    const insertResult = await BatchInserter.insert(
      this.manager,
      'Subgraph',
      subgraphRows,
    );

    // ============================================
    // Query Back Subgraph SystemIds
    // ============================================
    const successfulSubgraphNaturalIds = insertResult.succeeded.map(
      row => row.naturalId as number, // Using naturalId as natural key
    );
    const mappings = await this.queryBackSubgraphs(
      successfulSubgraphNaturalIds,
    );

    // ============================================
    // Build Results
    // ============================================
    return this.buildResults(subgraphs, mappings, insertResult);
  }

  /**
   * Convert Subgraph domain entity to database row
   */
  private toSubgraphRow(
    subgraph: Omit<Subgraph, 'systemId'>,
  ): QueryDeepPartialEntity<SubgraphRow> {
    return {
      name: subgraph.name,
      naturalId: subgraph.naturalId,
      isExported: subgraph.isExported,
      fileSystemId: subgraph.fileSystemId,
    };
  }

  /**
   * Query back Subgraph systemIds using natural keys (naturalId).
   * Uses indexed column for fast lookup.
   *
   * @param naturalIds - Array of subgraph naturalIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackSubgraphs(
    naturalIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (naturalIds.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('Subgraph', 's')
      .select(['s.systemId', 's.naturalId'])
      .where('s.naturalId IN (:...naturalIds)', {naturalIds})
      .getMany();

    return results.map(r => ({
      naturalId: r.naturalId,
      systemId: r.systemId,
    }));
  }

  /**
   * Build results with mappings and errors
   */
  private buildResults(
    subgraphs: readonly Omit<Subgraph, 'systemId'>[],
    mappings: NaturalIdMapping<number>[],
    insertResult: BatchInsertResult<QueryDeepPartialEntity<SubgraphRow>>,
  ): BulkEntityInsertResult<number> {
    const mappingMap = new Map(mappings.map(m => [m.naturalId, m.systemId]));

    const failedMap = new Map(
      insertResult.failed.map(f => [f.row.naturalId as number, f.error]),
    );

    const results = [];

    for (const subgraph of subgraphs) {
      const systemId = mappingMap.get(subgraph.naturalId);
      const error = failedMap.get(subgraph.naturalId);

      if (systemId) {
        results.push({
          idMapping: {naturalId: subgraph.naturalId, systemId},
          errors: [],
          success: true,
        });
      } else if (error) {
        results.push({
          errors: [this.buildError('Subgraph', subgraph.naturalId, error)],
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
