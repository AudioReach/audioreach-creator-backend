import {
  BulkEntityInsertResult,
  EntityInsertResult,
  NaturalIdMapping,
  UseCase,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {
  toKeyVectorRow,
  toUseCaseRow,
  toCategoryRow,
  generateKvHash,
} from './usecase-entity-mapper.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {KeyVectorRow, UseCaseRow} from '../../../entity-schema/index.js';

/**
 * UseCase with pre-computed kvHash for optimization.
 * Avoids redundant hash computations throughout the insertion process.
 */
type UseCaseWithHash = {
  useCase: Omit<UseCase, 'systemId'>;
  kvHash: string;
};

/**
 * Handles bulk insertion of UseCase entities.
 *
 * Process:
 * 1. Insert/lookup KeyVectors (using kvHash as natural key)
 * 2. Create many-to-many relationships between KeyVectors and ValueDefinitions
 * 3. Batch insert UseCases (using keyVectorSystemId)
 * 4. Query back using keyVectorSystemId (natural key)
 * 5. Insert/lookup Categories
 * 6. Create many-to-many relationships (categories, nodes, links)
 * 7. Update KeyVector.useCaseSystemId back-reference
 * 8. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class UseCaseInserter extends BaseInserter<
  Omit<UseCase, 'systemId'>,
  BulkEntityInsertResult<number>,
  string
> {
  /**
   * Insert UseCases and their relationships in bulk.
   *
   * @param useCases - UseCase domain entities without systemId
   * @returns Bulk insert result with keyVectorSystemId->useCaseSystemId mappings
   */
  async insert(
    useCases: readonly Omit<UseCase, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Early return for empty input
    if (useCases.length === 0) {
      return {results: []};
    }

    // Pre-compute kvHash once per UseCase for optimization
    const useCasesWithHash: UseCaseWithHash[] = useCases.map(useCase => ({
      useCase,
      kvHash: generateKvHash(useCase.keyVector.valueSystemIds),
    }));

    // ============================================
    // Step 1: Insert/Lookup KeyVectors
    // ============================================
    const keyVectorRows = useCasesWithHash.map(uc => toKeyVectorRow(uc.kvHash));
    const keyVectorInsertResult = await BatchInserter.insert(
      this.manager,
      'KeyVector',
      keyVectorRows,
    );

    // Query back KeyVector systemIds using kvHash
    const kvHashes = useCasesWithHash.map(uc => uc.kvHash);
    const keyVectorMappings = await this.queryBackKeyVectors(kvHashes);

    // O(1) lookup: kvHash → keyVectorSystemId
    const kvHashToSystemId = new Map(
      keyVectorMappings.map(m => [m.naturalId, m.systemId]),
    );

    // ============================================
    // Step 2: Create KeyVector-ValueDefinition Relationships
    // ============================================
    await this.createKeyVectorValueRelationships(
      useCasesWithHash,
      kvHashToSystemId,
    );

    // ============================================
    // Step 3: Batch Insert UseCases
    // ============================================
    const useCaseRowsWithKvHash: Array<{
      row: QueryDeepPartialEntity<UseCaseRow>;
      kvHash: string;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const keyVectorSystemId = kvHashToSystemId.get(kvHash);

      if (!keyVectorSystemId) continue;

      useCaseRowsWithKvHash.push({
        row: toUseCaseRow(useCase, keyVectorSystemId),
        kvHash,
      });
    }

    const useCaseInsertResult =
      useCaseRowsWithKvHash.length > 0
        ? await BatchInserter.insert(
            this.manager,
            'UseCase',
            useCaseRowsWithKvHash.map(u => u.row),
          )
        : {succeeded: [], failed: []};

    // ============================================
    // Step 4: Query Back UseCase SystemIds
    // ============================================
    const successfulKvHashes = useCaseRowsWithKvHash
      .filter((_, idx) =>
        useCaseInsertResult.succeeded.some((_, succIdx) => succIdx === idx),
      )
      .map(u => u.kvHash);

    const useCaseMappings = await this.queryBackUseCases(
      successfulKvHashes,
      kvHashToSystemId,
    );

    // O(1) lookup: kvHash → useCaseSystemId
    const kvHashToUseCaseSystemId = new Map(
      useCaseMappings.map(m => [m.naturalId, m.systemId]),
    );

    // ============================================
    // Step 5: Update KeyVector.useCaseSystemId Back-Reference
    // ============================================
    await this.updateKeyVectorBackReferences(useCaseMappings, kvHashToSystemId);

    // ============================================
    // Step 6: Handle Categories
    // ============================================
    await this.handleCategories(useCasesWithHash, kvHashToUseCaseSystemId);

    // ============================================
    // Step 7: Handle Many-to-Many Relationships
    // ============================================
    await this.handleManyToManyRelationships(
      useCasesWithHash,
      kvHashToUseCaseSystemId,
    );

    // ============================================
    // Step 8: Build Results
    // ============================================
    return this.buildResults(
      useCasesWithHash,
      kvHashToSystemId,
      kvHashToUseCaseSystemId,
      keyVectorInsertResult,
      useCaseInsertResult,
    );
  }

  /**
   * Query back KeyVector systemIds using kvHash (unique natural key).
   */
  private async queryBackKeyVectors(
    kvHashes: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (kvHashes.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('KeyVector', 'kv')
      .select(['kv.systemId', 'kv.kvHash'])
      .where('kv.kvHash IN (:...hashes)', {hashes: kvHashes})
      .getMany();

    return results.map(r => ({
      naturalId: r.kvHash,
      systemId: r.systemId,
    }));
  }

  /**
   * Create many-to-many relationships between KeyVectors and ValueDefinitions.
   */
  private async createKeyVectorValueRelationships(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToSystemId: Map<string, number>,
  ): Promise<void> {
    const relationships: Array<{
      key_vector_id: number;
      value_definition_id: number;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const keyVectorSystemId = kvHashToSystemId.get(kvHash);

      if (!keyVectorSystemId) continue;

      for (const valueSystemId of useCase.keyVector.valueSystemIds) {
        relationships.push({
          key_vector_id: keyVectorSystemId,
          value_definition_id: valueSystemId,
        });
      }
    }

    if (relationships.length > 0) {
      // Use raw insert to avoid duplicate key errors (ON CONFLICT IGNORE)
      await this.manager
        .createQueryBuilder()
        .insert()
        .into('key_vector_values')
        .values(relationships)
        .orIgnore()
        .execute();
    }
  }

  /**
   * Query back UseCase systemIds using keyVectorSystemId (natural key via KeyVector).
   */
  private async queryBackUseCases(
    kvHashes: string[],
    kvHashToSystemId: Map<string, number>,
  ): Promise<NaturalIdMapping<string>[]> {
    if (kvHashes.length === 0) return [];

    // Get keyVectorSystemIds from kvHashes
    const keyVectorSystemIds = kvHashes
      .map(hash => kvHashToSystemId.get(hash))
      .filter((id): id is number => id !== undefined);

    if (keyVectorSystemIds.length === 0) return [];

    // Query UseCases by joining with KeyVector
    const results = await this.manager
      .createQueryBuilder('UseCase', 'uc')
      .innerJoin('KeyVector', 'kv', 'kv.useCaseSystemId = uc.systemId')
      .select(['uc.systemId', 'kv.kvHash'])
      .where('kv.systemId IN (:...ids)', {ids: keyVectorSystemIds})
      .getRawMany<{uc_systemId: number; kv_kvHash: string}>();

    return results.map(r => ({
      naturalId: r.kv_kvHash,
      systemId: r.uc_systemId,
    }));
  }

  /**
   * Update KeyVector.useCaseSystemId back-reference after UseCase insertion.
   * Uses bulk update with CASE statement for better performance and to avoid race conditions.
   */
  private async updateKeyVectorBackReferences(
    useCaseMappings: NaturalIdMapping<string>[],
    kvHashToSystemId: Map<string, number>,
  ): Promise<void> {
    if (useCaseMappings.length === 0) return;

    // Build CASE statement for bulk update
    const cases = useCaseMappings
      .map(mapping => {
        const keyVectorSystemId = kvHashToSystemId.get(mapping.naturalId);
        return keyVectorSystemId
          ? `WHEN systemId = ${keyVectorSystemId} THEN ${mapping.systemId}`
          : null;
      })
      .filter(c => c !== null)
      .join(' ');

    if (cases) {
      const keyVectorIds = useCaseMappings
        .map(m => kvHashToSystemId.get(m.naturalId))
        .filter((id): id is number => id !== undefined);

      await this.manager
        .createQueryBuilder()
        .update('KeyVector')
        .set({
          useCaseSystemId: () => `CASE ${cases} END`,
        })
        .where('systemId IN (:...ids)', {ids: keyVectorIds})
        .execute();
    }
  }

  /**
   * Handle category insertion and relationships.
   */
  private async handleCategories(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToUseCaseSystemId: Map<string, number>,
  ): Promise<void> {
    // Collect all unique category names
    const allCategories = new Set<string>();
    for (const {useCase} of useCasesWithHash) {
      if (useCase.categories) {
        for (const category of useCase.categories) {
          allCategories.add(category);
        }
      }
    }

    if (allCategories.size === 0) return;

    // Insert categories (ignore duplicates)
    const categoryRows = Array.from(allCategories).map(name =>
      toCategoryRow(name),
    );
    await BatchInserter.insert(this.manager, 'UseCaseCategory', categoryRows);

    // Query back category systemIds
    const categoryMappings = await this.queryBackCategories(
      Array.from(allCategories),
    );
    const categoryNameToSystemId = new Map(
      categoryMappings.map(m => [m.naturalId, m.systemId]),
    );

    // Create UseCase-Category relationships
    const relationships: Array<{
      use_case_system_id: number;
      category_system_id: number;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const useCaseSystemId = kvHashToUseCaseSystemId.get(kvHash);

      if (!useCaseSystemId) continue;
      if (!useCase.categories) continue;

      for (const categoryName of useCase.categories) {
        const categorySystemId = categoryNameToSystemId.get(categoryName);
        if (!categorySystemId) continue;

        relationships.push({
          use_case_system_id: useCaseSystemId,
          category_system_id: categorySystemId,
        });
      }
    }

    if (relationships.length > 0) {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into('use_case_categories')
        .values(relationships)
        .orIgnore()
        .execute();
    }
  }

  /**
   * Query back category systemIds by name.
   */
  private async queryBackCategories(
    names: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (names.length === 0) return [];

    const results = await this.manager
      .createQueryBuilder('UseCaseCategory', 'cat')
      .select(['cat.systemId', 'cat.name'])
      .where('cat.name IN (:...names)', {names})
      .getMany();

    return results.map(r => ({
      naturalId: r.name,
      systemId: r.systemId,
    }));
  }

  /**
   * Handle many-to-many relationships for nodes, dataLinks, and controlLinks.
   */
  private async handleManyToManyRelationships(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToUseCaseSystemId: Map<string, number>,
  ): Promise<void> {
    // Handle nodes (modules)
    await this.createNodeRelationships(
      useCasesWithHash,
      kvHashToUseCaseSystemId,
    );

    // Handle data links
    await this.createDataLinkRelationships(
      useCasesWithHash,
      kvHashToUseCaseSystemId,
    );

    // Handle control links
    await this.createControlLinkRelationships(
      useCasesWithHash,
      kvHashToUseCaseSystemId,
    );
  }

  /**
   * Create UseCase-Node relationships.
   */
  private async createNodeRelationships(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToUseCaseSystemId: Map<string, number>,
  ): Promise<void> {
    const relationships: Array<{
      use_case_system_id: number;
      node_system_id: number;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const useCaseSystemId = kvHashToUseCaseSystemId.get(kvHash);

      if (!useCaseSystemId) continue;

      for (const nodeSystemId of useCase.moduleSystemIds) {
        relationships.push({
          use_case_system_id: useCaseSystemId,
          node_system_id: nodeSystemId,
        });
      }
    }

    if (relationships.length > 0) {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into('use_case_nodes')
        .values(relationships)
        .orIgnore()
        .execute();
    }
  }

  /**
   * Create UseCase-DataLink relationships.
   */
  private async createDataLinkRelationships(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToUseCaseSystemId: Map<string, number>,
  ): Promise<void> {
    const relationships: Array<{
      use_case_system_id: number;
      data_link_system_id: number;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const useCaseSystemId = kvHashToUseCaseSystemId.get(kvHash);

      if (!useCaseSystemId) continue;

      for (const dataLinkSystemId of useCase.dataLinkSystemIds) {
        relationships.push({
          use_case_system_id: useCaseSystemId,
          data_link_system_id: dataLinkSystemId,
        });
      }
    }

    if (relationships.length > 0) {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into('use_case_data_links')
        .values(relationships)
        .orIgnore()
        .execute();
    }
  }

  /**
   * Create UseCase-ControlLink relationships.
   */
  private async createControlLinkRelationships(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToUseCaseSystemId: Map<string, number>,
  ): Promise<void> {
    const relationships: Array<{
      use_case_system_id: number;
      control_link_system_id: number;
    }> = [];

    for (const {useCase, kvHash} of useCasesWithHash) {
      const useCaseSystemId = kvHashToUseCaseSystemId.get(kvHash);

      if (!useCaseSystemId) continue;

      for (const controlLinkSystemId of useCase.controlLinkSystemIds) {
        relationships.push({
          use_case_system_id: useCaseSystemId,
          control_link_system_id: controlLinkSystemId,
        });
      }
    }

    if (relationships.length > 0) {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into('use_case_control_links')
        .values(relationships)
        .orIgnore()
        .execute();
    }
  }

  /**
   * Build results with O(1) lookups using Maps.
   * Returns useCaseSystemId for successful insertions, with proper error tracking.
   */
  private buildResults(
    useCasesWithHash: readonly UseCaseWithHash[],
    kvHashToSystemId: Map<string, number>,
    kvHashToUseCaseSystemId: Map<string, number>,
    keyVectorInsertResult: BatchInsertResult<
      QueryDeepPartialEntity<KeyVectorRow>
    >,
    useCaseInsertResult: BatchInsertResult<QueryDeepPartialEntity<UseCaseRow>>,
  ): BulkEntityInsertResult<number> {
    const results: EntityInsertResult<number>[] = [];

    // Build failure lookup maps from batch results
    const failedKvMap = new Map<string, Error>(
      keyVectorInsertResult.failed.map(f => [f.row.kvHash as string, f.error]),
    );

    // Build UseCase failure map - need to correlate back to kvHash
    // Since we filtered out failed KeyVectors before inserting UseCases,
    // we need to map UseCase failures back to their kvHash
    const failedUseCaseMap = new Map<string, Error>();

    // TODO: Fix #3 - Error correlation fragility
    // Current implementation relies on array index matching between useCaseRowsAttempted
    // and useCaseInsertResult.failed, which is fragile and depends on order of execution.
    // Need a more robust approach that doesn't rely on positional correlation, such as:
    // - Including natural key (kvHash) in BatchInsertResult failure information
    // - Using a different correlation mechanism that's not order-dependent
    // - Restructuring the error handling to be more explicit about which entity failed

    // Create reverse mapping: row index -> kvHash for UseCases that were attempted
    const useCaseRowsAttempted = useCasesWithHash
      .filter(({kvHash}) => kvHashToSystemId.has(kvHash))
      .map(({kvHash}) => kvHash);

    for (let i = 0; i < useCaseInsertResult.failed.length; i++) {
      const failure = useCaseInsertResult.failed[i];
      const kvHash = useCaseRowsAttempted[i];
      if (kvHash) {
        failedUseCaseMap.set(kvHash, failure.error);
      }
    }

    // Build result for each input UseCase
    for (const {kvHash} of useCasesWithHash) {
      const keyVectorSystemId = kvHashToSystemId.get(kvHash);
      const useCaseSystemId = kvHashToUseCaseSystemId.get(kvHash);

      // Check for KeyVector failure first
      if (!keyVectorSystemId) {
        const error = failedKvMap.get(kvHash);
        results.push({
          errors: [
            this.buildError(
              'KeyVector',
              kvHash,
              error || new Error('KeyVector insert failed'),
            ),
          ],
          success: false,
        });
        continue;
      }

      // Check for UseCase failure
      if (!useCaseSystemId) {
        const error = failedUseCaseMap.get(kvHash);
        results.push({
          errors: [
            this.buildError(
              'UseCase',
              kvHash,
              error || new Error('UseCase insert failed'),
            ),
          ],
          success: false,
        });
        continue;
      }

      // Success case - return useCaseSystemId as both naturalId and systemId
      results.push({
        idMapping: {
          naturalId: useCaseSystemId,
          systemId: useCaseSystemId,
        },
        errors: [],
        success: true,
      });
    }

    return {results};
  }
}
