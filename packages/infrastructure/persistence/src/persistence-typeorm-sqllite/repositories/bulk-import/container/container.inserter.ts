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
 * 2. Query back using type (natural key)
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
    const successfulContainerTypes = insertResult.succeeded.map(
      row => row.type as string, // Using type as natural key
    );
    const mappings = await this.queryBackContainers(successfulContainerTypes);

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
      fileSystemId: container.fileSystemId,
    };
  }

  /**
   * Query back Container systemIds using natural keys (type).
   * Uses indexed column for fast lookup.
   *
   * @param types - Array of container types to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackContainers(
    types: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (types.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('Container', 'c')
      .select(['c.systemId', 'c.type'])
      .where('c.type IN (:...types)', {types})
      .getMany();

    return results.map(r => ({
      naturalId: r.type,
      systemId: r.systemId,
    }));
  }

  /**
   * Build results with mappings and errors
   */
  private buildResults(
    containers: readonly Omit<Container, 'systemId'>[],
    mappings: NaturalIdMapping<string>[],
    insertResult: BatchInsertResult<QueryDeepPartialEntity<ContainerRow>>,
  ): BulkEntityInsertResult<number> {
    const mappingMap = new Map(mappings.map(m => [m.naturalId, m.systemId]));

    const failedMap = new Map(
      insertResult.failed.map(f => [f.row.type as string, f.error]),
    );

    const results = [];

    for (const container of containers) {
      const systemId = mappingMap.get(container.type);
      const error = failedMap.get(container.type);

      if (systemId) {
        // Use the actual naturalId from the container entity
        results.push({
          idMapping: {naturalId: container.naturalId, systemId},
          errors: [],
          success: true,
        });
      } else if (error) {
        results.push({
          errors: [this.buildError('Container', container.type, error)],
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
