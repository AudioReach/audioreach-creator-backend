import {BulkEntityInsertResult, Subgraph, NaturalIdMapping} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {EntityRowForInsert, SubgraphRow} from '../../../entity-schema/index.js';

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
    const successfulSubgraphIds = insertResult.succeeded
      .map(
        row =>
          (row as EntityRowForInsert<SubgraphRow> & {subgraphId: number})
            .subgraphId,
      )
      .filter((id): id is number => id !== undefined);
    const mappings = await this.queryBackSubgraphs(successfulSubgraphIds);

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
  ): EntityRowForInsert<SubgraphRow> {
    return {
      name: subgraph.name,
      subgraphId: subgraph.subgraphId,
      isExported: subgraph.isExported,
      fileSystemId: subgraph.fileSystemId,
    };
  }

  /**
   * Query back Subgraph systemIds using natural keys (subgraphId).
   * Uses indexed column for fast lookup.
   *
   * @param subgraphIds - Array of subgraph subgraphIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackSubgraphs(
    subgraphIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (subgraphIds.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('Subgraph', 's')
      .select(['s.systemId', 's.subgraphId'])
      .where('s.subgraphId IN (:...subgraphIds)', {subgraphIds})
      .getMany();

    return results.map(r => ({
      naturalId: r.subgraphId,
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
      insertResult.failed.map(f => [f.row.subgraphId as number, f.error]),
    );

    const results = [];

    for (const subgraph of subgraphs) {
      const systemId = mappingMap.get(subgraph.subgraphId);
      const error = failedMap.get(subgraph.subgraphId);

      if (systemId) {
        results.push({
          idMapping: {naturalId: subgraph.subgraphId, systemId},
          errors: [],
          success: true,
        });
      } else if (error) {
        results.push({
          errors: [this.buildError('Subgraph', subgraph.subgraphId, error)],
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
