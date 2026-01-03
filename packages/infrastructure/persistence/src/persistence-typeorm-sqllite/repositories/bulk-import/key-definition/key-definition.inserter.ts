import {
  type BulkKeyDefinitionInsertResult,
  KEY_DEF_AGGREGATE_ENTITY_TYPES,
  KeyDefinition,
  type KeyDefinitionInsertError,
  type KeyDefinitionInsertErrorEntity,
  type KeyDefinitionInsertResult,
  type NaturalIdMapping,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {toKeyRow, toValueRow} from './key-definition-entity-mapper.js';
import {BatchInserter, type BatchInsertResult} from '../batch-inserter.js';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import type {
  KeyDefinitionRow,
  ValueDefinitionRow,
} from '../../../entity-schema/index.js';
/**
 * Handles bulk insertion of KeyDefinition aggregates (keys + values).
 *
 * Process:
 * 1. Batch insert all KeyDefinitions
 * 2. Query back using keyId (natural key)
 * 3. Batch insert all ValueDefinitions (using parent systemIds)
 * 4. Query back using valueId (natural key)
 * 5. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class KeyDefinitionInserter extends BaseInserter<
  Omit<KeyDefinition, 'systemId'>,
  BulkKeyDefinitionInsertResult,
  KeyDefinitionInsertErrorEntity
> {
  /**
   * Insert KeyDefinitions and their ValueDefinitions in bulk.
   *
   * @param keys - KeyDefinition domain entities without systemId
   * @returns Bulk insert result with natural key mappings and per-entity errors
   */
  async insert(
    keys: readonly Omit<KeyDefinition, 'systemId'>[],
  ): Promise<BulkKeyDefinitionInsertResult> {
    // Early return for empty input
    if (keys.length === 0) {
      return {results: []};
    }

    // ============================================
    // Batch Insert KeyDefinitions
    // ============================================
    const keyRows = keys.map(k => toKeyRow(k));
    const keyInsertResult = await BatchInserter.insert(
      this.manager,
      'KeyDefinition',
      keyRows,
    );

    // ============================================
    // Query Back KeyDefinition SystemIds
    // ============================================
    const successfulKeyIds = keyInsertResult.succeeded.map(
      row => row.keyId as number,
    );
    const keyMappings = await this.queryBackKeys(successfulKeyIds);

    // O(1) lookup: keyId → systemId
    const keyIdToSystemId = new Map(
      keyMappings.map(m => [m.naturalId, m.systemId]),
    );

    const valueRowsWithKeyId: Array<{
      row: QueryDeepPartialEntity<ValueDefinitionRow>;
      keyId: number;
    }> = [];

    for (const key of keys) {
      const keySystemId = keyIdToSystemId.get(key.keyId);
      if (!keySystemId) continue;

      for (const value of key.values) {
        valueRowsWithKeyId.push({
          row: toValueRow(value, keySystemId),
          keyId: key.keyId,
        });
      }
    }

    const valueInsertResult =
      valueRowsWithKeyId.length > 0
        ? await BatchInserter.insert(
            this.manager,
            'ValueDefinition',
            valueRowsWithKeyId.map(v => v.row),
          )
        : {succeeded: [], failed: []};

    // ============================================
    // Query Back ValueDefinition SystemIds (Composite Key)
    // ============================================
    const valueMappings = await this.queryBackValuesComposite(
      valueRowsWithKeyId,
      valueInsertResult.succeeded,
    );

    // Group value mappings by keyId
    const valueMappingsByKey = new Map<number, NaturalIdMapping<number>[]>();
    for (const {mapping, keyId} of valueMappings) {
      if (!valueMappingsByKey.has(keyId)) {
        valueMappingsByKey.set(keyId, []);
      }
      valueMappingsByKey.get(keyId)!.push(mapping);
    }

    // ============================================
    // Build Results (Optimized)
    // ============================================
    return this.buildResultsOptimized(
      keys,
      keyIdToSystemId,
      valueMappingsByKey,
      keyInsertResult,
      valueInsertResult,
    );
  }

  /**
   * Build results with O(1) lookups using Maps.
   */
  private buildResultsOptimized(
    keys: readonly Omit<KeyDefinition, 'systemId'>[],
    keyIdToSystemId: Map<number, number>,
    valueMappingsByKey: Map<number, NaturalIdMapping<number>[]>,
    keyInsertResult: BatchInsertResult<
      QueryDeepPartialEntity<KeyDefinitionRow>
    >,
    valueInsertResult: BatchInsertResult<
      QueryDeepPartialEntity<ValueDefinitionRow>
    >,
  ): BulkKeyDefinitionInsertResult {
    const results: KeyDefinitionInsertResult[] = [];

    // Build failure lookup maps with explicit types
    const failedKeyMap = new Map<
      number,
      {row: QueryDeepPartialEntity<KeyDefinitionRow>; error: Error}
    >(keyInsertResult.failed.map(f => [f.row.keyId as number, f]));

    const failedValueMap = new Map<
      number,
      {row: QueryDeepPartialEntity<ValueDefinitionRow>; error: Error}
    >(valueInsertResult.failed.map(f => [f.row.valueId as number, f]));

    for (const key of keys) {
      const keySystemId = keyIdToSystemId.get(key.keyId);
      const errors: KeyDefinitionInsertError[] = [];

      if (!keySystemId) {
        const failure = failedKeyMap.get(key.keyId);

        errors.push(
          this.buildError(
            KEY_DEF_AGGREGATE_ENTITY_TYPES.KEY_DEFINITION,
            key.keyId,
            failure?.error || new Error('Key insert failed'),
          ),
        );

        results.push({
          childMappings: {valueDefinitions: []},
          errors,
          success: false,
        });
        continue;
      }

      // Check for value failures
      for (const value of key.values) {
        const valueFailed = failedValueMap.get(value.valueId);

        if (valueFailed) {
          errors.push(
            this.buildError(
              KEY_DEF_AGGREGATE_ENTITY_TYPES.VALUE_DEFINITION,
              value.valueId,
              valueFailed.error,
            ),
          );
        }
      }

      results.push({
        keyDefinitionIdMapping: {
          naturalId: key.keyId,
          systemId: keySystemId,
        },
        childMappings: {
          valueDefinitions: valueMappingsByKey.get(key.keyId) || [],
        },
        errors,
        success: true,
      });
    }

    return {results};
  }

  /**
   * Query back KeyDefinition systemIds using natural keys (keyId).
   * Uses indexed column for fast lookup.
   *
   * @param keyIds - Array of keyIds to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackKeys(
    keyIds: number[],
  ): Promise<NaturalIdMapping<number>[]> {
    if (keyIds.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('KeyDefinition', 'k')
      .select(['k.systemId', 'k.keyId'])
      .where('k.keyId IN (:...ids)', {ids: keyIds})
      .getMany();

    return results.map(r => ({
      naturalId: r.keyId,
      systemId: r.systemId,
    }));
  }

  /**
   * Query back ValueDefinition systemIds using composite key (keySystemId + valueId).
   * Maps results back to keyId using keySystemId.
   */
  private async queryBackValuesComposite(
    valueRowsWithKeyId: Array<{
      row: QueryDeepPartialEntity<ValueDefinitionRow>;
      keyId: number;
    }>,
    succeededRows: QueryDeepPartialEntity<ValueDefinitionRow>[],
  ): Promise<Array<{mapping: NaturalIdMapping<number>; keyId: number}>> {
    if (succeededRows.length === 0) return [];

    // Build sets for efficient querying
    const keySystemIds = [
      ...new Set(succeededRows.map(row => row.keySystemId as number)),
    ];
    const valueIds = [
      ...new Set(succeededRows.map(row => row.valueId as number)),
    ];

    // Query using composite key constraints
    const results = await this.manager
      .createQueryBuilder('ValueDefinition', 'v')
      .select(['v.systemId', 'v.valueId', 'v.keySystemId'])
      .where('v.valueId IN (:...valueIds)', {valueIds})
      .andWhere('v.keySystemId IN (:...keySystemIds)', {keySystemIds})
      .getMany();

    // Build reverse lookup: keySystemId → keyId
    const systemIdToKeyId = new Map<number, number>();
    for (const {row, keyId} of valueRowsWithKeyId) {
      systemIdToKeyId.set(row.keySystemId as number, keyId);
    }

    // Map results back to domain format with keyId context
    const mappings: Array<{mapping: NaturalIdMapping<number>; keyId: number}> =
      [];
    for (const result of results) {
      const keyId = systemIdToKeyId.get(result.keySystemId);
      if (keyId !== undefined) {
        mappings.push({
          mapping: {
            naturalId: result.valueId,
            systemId: result.systemId,
          },
          keyId,
        });
      }
    }

    return mappings;
  }
}
