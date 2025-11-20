import {BulkEntityInsertResult, Container, NaturalIdMapping} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {ContainerRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of Container entities.
 *
 * Process:
 * 1. Batch insert all Containers
 * 2. Query back using naturalId (natural key)
 * 3. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class ContainerInserter extends BaseInserter<
  Omit<Container, 'systemId'>,
  BulkEntityInsertResult<number>,
  string
> {
  /**
   * Insert Containers in bulk.
   *
   * @param containers - Container domain entities without systemId
   * @returns Bulk insert result with natural key mappings and errors
   */
  async insert(
    containers: readonly Omit<Container, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Early return for empty input
    if (containers.length === 0) {
      return {
        results: [],
      };
    }

    // ============================================
    // Batch Insert Containers
    // ============================================
    const containerRows = containers.map(c => this.toContainerRow(c));
    const insertResult = await BatchInserter.insert(
      this.manager,
      'Container',
      containerRows,
    );

    // ============================================
    // Query Back Container SystemIds
    // ============================================
    const successfulContainerNaturalIds = insertResult.succeeded.map(
      row => row.naturalId as number, // Using naturalId as natural key
    );
    const mappings = await this.queryBackContainers(
      successfulContainerNaturalIds,
    );

    // ============================================
    // Build Results
    // ============================================
    return this.buildResults(containers, mappings, insertResult);
  }

  /**
   * Convert Container domain entity to database row
   */
  private toContainerRow(
    container: Omit<Container, 'systemId'>,
  ): QueryDeepPartialEntity<ContainerRow> {
    return {
      type: container.type,
      naturalId: container.naturalId,
      fileSystemId: container.fileSystemId,
    };
  }

  /**
   * Query back Container systemIds using natural keys (naturalId).
   * Uses indexed column for fast lookup.
   *
   * @param naturalIds - Array of container naturalIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackContainers(
    naturalIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (naturalIds.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('Container', 'c')
      .select(['c.systemId', 'c.naturalId'])
      .where('c.naturalId IN (:...naturalIds)', {naturalIds})
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
    containers: readonly Omit<Container, 'systemId'>[],
    mappings: NaturalIdMapping<number>[],
    insertResult: BatchInsertResult<QueryDeepPartialEntity<ContainerRow>>,
  ): BulkEntityInsertResult<number> {
    const mappingMap = new Map(mappings.map(m => [m.naturalId, m.systemId]));

    const failedMap = new Map(
      insertResult.failed.map(f => [f.row.naturalId as number, f.error]),
    );

    const results = [];

    for (const container of containers) {
      const systemId = mappingMap.get(container.naturalId);
      const error = failedMap.get(container.naturalId);

      if (systemId) {
        results.push({
          idMapping: {naturalId: container.naturalId, systemId},
          errors: [],
          success: true,
        });
      } else if (error) {
        results.push({
          errors: [this.buildError('Container', container.naturalId, error)],
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
