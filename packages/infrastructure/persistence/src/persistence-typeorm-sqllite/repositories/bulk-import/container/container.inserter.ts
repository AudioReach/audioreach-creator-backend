/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type BulkEntityInsertResult,
  Container,
  type NaturalIdMapping,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, type BatchInsertResult} from '../batch-inserter.js';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {
  type ContainerRow,
  type EntityRowForInsert,
} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of Container entities.
 *
 * Process:
 * 1. Batch insert all Containers
 * 2. Query back using containerId (natural key)
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
    const successfulContainerIds = insertResult.succeeded
      .map(
        row =>
          (row as EntityRowForInsert<ContainerRow> & {containerId: number})
            .containerId,
      )
      .filter((id): id is number => id != null);
    const mappings = await this.queryBackContainers(successfulContainerIds);

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
  ): EntityRowForInsert<ContainerRow> {
    return {
      type: container.type,
      containerId: container.containerId,
      fileSystemId: container.fileSystemId,
    };
  }

  /**
   * Query back Container systemIds using natural keys (containerId).
   * Uses indexed column for fast lookup.
   *
   * @param containerIds - Array of container containerIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackContainers(
    containerIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (containerIds.length === 0) return [];

    const results = (await this.manager
      .createQueryBuilder('Container', 'c')
      .select(['c.systemId', 'c.containerId'])
      .where('c.containerId IN (:...containerIds)', {containerIds})
      .getMany()) as Array<{systemId: number; containerId: number}>;

    return results.map(r => ({
      naturalId: r.containerId,
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
      insertResult.failed.map(f => [f.row.containerId as number, f.error]),
    );

    const results = [];

    for (const container of containers) {
      const systemId = mappingMap.get(container.containerId);
      const error = failedMap.get(container.containerId);

      if (systemId) {
        results.push({
          idMapping: {naturalId: container.containerId, systemId},
          errors: [],
          success: true,
        });
      } else if (error) {
        results.push({
          errors: [this.buildError('Container', container.containerId, error)],
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
