/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type BulkModuleDefinitionInsertResult,
  MODULE_DEF_AGGREGATE_ENTITY_TYPES,
  SpfModuleDefinition,
  type ModuleDefinitionInsertError,
  type ModuleDefinitionInsertErrorEntity,
  type ModuleDefinitionInsertResult,
  type NaturalIdMapping,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {toSpfModuleDefinitionRow} from './module-definition-entity-mapper.js';
import type {BatchInsertResult} from '../batch-inserter.js';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import type {SpfModuleDefinitionRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of SpfModuleDefinition entities.
 *
 * Process:
 * 1. Batch insert all SpfModuleDefinitions
 * 2. Query back using moduleDefinitionId (natural key)
 * 3. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 * Returns empty parameterDefinitions array for future expansion.
 */
export class ModuleDefinitionInserter extends BaseInserter<
  Omit<SpfModuleDefinition, 'systemId'>,
  BulkModuleDefinitionInsertResult,
  ModuleDefinitionInsertErrorEntity
> {
  /**
   * Insert SpfModuleDefinitions in bulk with cascading port groups and ports.
   *
   * @param moduleDefinitions - SpfModuleDefinition domain entities without systemId
   * @returns Bulk insert result with natural key mappings and per-entity errors
   */
  async insert(
    moduleDefinitions: readonly Omit<SpfModuleDefinition, 'systemId'>[],
  ): Promise<BulkModuleDefinitionInsertResult> {
    // Early return for empty input
    if (moduleDefinitions.length === 0) {
      return {results: []};
    }

    // ============================================
    // Insert ModuleDefinitions with cascading relations
    // ============================================
    const moduleDefinitionRows = moduleDefinitions.map(md =>
      toSpfModuleDefinitionRow(md),
    );

    // Use save() instead of insert() to enable cascade inserts for related entities
    const succeeded: QueryDeepPartialEntity<SpfModuleDefinitionRow>[] = [];
    const failed: Array<{
      row: QueryDeepPartialEntity<SpfModuleDefinitionRow>;
      error: Error;
    }> = [];

    for (const row of moduleDefinitionRows) {
      try {
        await this.manager.save('SpfModuleDefinition', row);
        succeeded.push(row);
      } catch (error) {
        failed.push({row, error: error as Error});
      }
    }

    const moduleDefinitionInsertResult = {succeeded, failed};

    // ============================================
    // Query Back ModuleDefinition SystemIds
    // ============================================
    const successfulModuleDefinitionIds = succeeded.map(
      (row: QueryDeepPartialEntity<SpfModuleDefinitionRow>) =>
        row.moduleDefinitionId as number,
    );
    const moduleDefinitionMappings = await this.queryBackModuleDefinitions(
      successfulModuleDefinitionIds,
    );

    // O(1) lookup: moduleDefinitionId → systemId
    const moduleDefinitionIdToSystemId = new Map(
      moduleDefinitionMappings.map(m => [m.naturalId, m.systemId]),
    );

    // ============================================
    // Build Results
    // ============================================
    return this.buildResults(
      moduleDefinitions,
      moduleDefinitionIdToSystemId,
      moduleDefinitionInsertResult,
    );
  }

  /**
   * Build results with O(1) lookups using Maps.
   */
  private buildResults(
    moduleDefinitions: readonly Omit<SpfModuleDefinition, 'systemId'>[],
    moduleDefinitionIdToSystemId: Map<number, number>,
    moduleDefinitionInsertResult: BatchInsertResult<
      QueryDeepPartialEntity<SpfModuleDefinitionRow>
    >,
  ): BulkModuleDefinitionInsertResult {
    const results: ModuleDefinitionInsertResult[] = [];

    // Build failure lookup map
    const failedModuleDefinitionMap = new Map<
      number,
      {row: QueryDeepPartialEntity<SpfModuleDefinitionRow>; error: Error}
    >(
      moduleDefinitionInsertResult.failed.map(f => [
        f.row.moduleDefinitionId as number,
        f,
      ]),
    );

    for (const moduleDefinition of moduleDefinitions) {
      const moduleDefinitionSystemId = moduleDefinitionIdToSystemId.get(
        moduleDefinition.moduleDefinitionId,
      );
      const errors: ModuleDefinitionInsertError[] = [];

      if (!moduleDefinitionSystemId) {
        const failure = failedModuleDefinitionMap.get(
          moduleDefinition.moduleDefinitionId,
        );

        errors.push(
          this.buildError(
            MODULE_DEF_AGGREGATE_ENTITY_TYPES.MODULE_DEFINITION,
            moduleDefinition.moduleDefinitionId,
            failure?.error || new Error('ModuleDefinition insert failed'),
          ),
        );

        results.push({
          childMappings: {parameterDefinitions: []},
          errors,
          success: false,
        });
        continue;
      }

      results.push({
        definitionIdMapping: {
          naturalId: moduleDefinition.moduleDefinitionId,
          systemId: moduleDefinitionSystemId,
        },
        childMappings: {
          parameterDefinitions: [], // Empty for future expansion
        },
        errors,
        success: true,
      });
    }

    return {results};
  }

  /**
   * Query back ModuleDefinition systemIds using natural keys (moduleDefinitionId).
   * Uses indexed column for fast lookup.
   *
   * @param moduleDefinitionIds - Array of moduleDefinitionIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackModuleDefinitions(
    moduleDefinitionIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (moduleDefinitionIds.length === 0) return [];

    const results = (await this.manager
      .createQueryBuilder('SpfModuleDefinition', 'md')
      .select(['md.systemId', 'md.moduleDefinitionId'])
      .where('md.moduleDefinitionId IN (:...ids)', {ids: moduleDefinitionIds})
      .getMany()) as Array<{systemId: number; moduleDefinitionId: number}>;

    return results.map(r => ({
      naturalId: r.moduleDefinitionId,
      systemId: r.systemId,
    }));
  }
}
