import {DataSource, Repository, QueryRunner, EntityManager} from 'typeorm';
import {getAllEntitySchemas} from '../../../src/persistence-typeorm-sqllite/entity-schema/index.js';
import {TestBlobConverter} from './test-blob-converter.js';

/**
 * Test database setup and teardown utilities for AudioReach persistence integration tests
 * Uses in-memory SQLite for fast, isolated testing
 */

let testDataSource: DataSource | null = null;

/**
 * Initialize test database with in-memory SQLite
 * @returns Initialized DataSource instance
 */
export const setupTestDatabase = async (): Promise<DataSource> => {
  if (testDataSource && testDataSource.isInitialized) {
    return testDataSource;
  }

  // Create a test blob converter for binary data handling
  const blobConverter = new TestBlobConverter();

  // Get all entity schemas with blob converter
  const entities = getAllEntitySchemas(blobConverter);

  try {
    testDataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true, // Auto-create tables from schemas
      logging: false, // Set to true for debugging
      entities,
    });

    await testDataSource.initialize();
    return testDataSource;
  } catch (error) {
    console.error('Error initializing test database:', error);
    throw error;
  }
};

/**
 * Clean up test database and close connections
 */
export const teardownTestDatabase = async (): Promise<void> => {
  if (testDataSource && testDataSource.isInitialized) {
    await testDataSource.destroy();
    testDataSource = null;
  }
};

/**
 * Clear all data from test database (for test isolation)
 * Clears tables in reverse dependency order to avoid foreign key constraints
 */
export const clearTestDatabase = async (): Promise<void> => {
  if (!testDataSource || !testDataSource.isInitialized) {
    throw new Error('Test database not initialized');
  }

  // Clear in reverse dependency order to avoid foreign key constraints
  const tablesToClear = [
    // Edit session tables (modification framework)
    'edit_actions',
    'restore_points',
    'edit_sessions',
    'session_modes',
    // Links
    'control_links',
    'data_links',
    // Nodes
    'intents',
    'control_ports',
    'data_ports',
    'nodes',
    // Module data
    'tkv_parameter_payloads',
    'tkvs',
    'module_tag_id_maps',
    'ckv_parameter_payload_rows',
    'ckvs',
    'spf_module_properties_data',
    'spf_modules',
    // Container data
    'container_property_data',
    'containers',
    // Subgraph data
    'vcpm_parameter_payloads',
    'vcpm_instances',
    'vcpm_ckvs',
    'subgraph_property_data',
    'subgraphs',
    // Use cases
    'use_case_categories',
    'use_cases',
    // Key-value system
    'key_vectors',
    'value_definitions',
    'key_definitions',
    // Definitions
    'module_property_definitions',
    'dynamic_intent_definitions',
    'static_intent_definitions',
    'static_control_port_definitions',
    'data_port_definitions',
    'data_port_groups',
    'module_attributes',
    'module_definition_meta_data',
    'driver_module_parameter_definitions',
    'driver_module_definitions',
    'spf_module_parameter_definitions',
    'spf_module_definitions',
    'vcpm_module_parameter_definitions',
    'vcpm_module_definitions',
    'subgraph_property_definitions',
    'container_property_definitions',
    'container_types',
    'processor_definitions',
    // Project data
    'arc_db_files',
    'projects',
  ];

  for (const tableName of tablesToClear) {
    try {
      await testDataSource.query(`DELETE FROM ${tableName}`);
    } catch (error) {
      // Table might not exist, ignore error
      // console.warn(`Could not clear table ${tableName}:`, error);
    }
  }
};

/**
 * Get test database connection
 * @returns Active DataSource instance
 * @throws Error if database not initialized
 */
export const getTestDataSource = (): DataSource => {
  if (!testDataSource || !testDataSource.isInitialized) {
    throw new Error(
      'Test database not initialized. Call setupTestDatabase() first.',
    );
  }
  return testDataSource;
};

/**
 * Execute raw SQL query for testing
 * @param query - SQL query string
 * @param parameters - Query parameters
 * @returns Query result
 */
export const executeTestQuery = async (
  query: string,
  parameters?: unknown[],
): Promise<unknown> => {
  const dataSource = getTestDataSource();
  return await dataSource.query(query, parameters);
};

/**
 * Get repository for entity testing
 * @param entitySchema - Entity schema to get repository for
 * @returns TypeORM Repository instance
 */
export const getTestRepository = <T>(entitySchema: unknown): Repository<T> => {
  const dataSource = getTestDataSource();
  return dataSource.getRepository(entitySchema as never);
};

/**
 * Get repository from a QueryRunner's manager (for transaction tests)
 * IMPORTANT: When testing transactions, ALL database operations must use
 * repositories obtained from the QueryRunner's manager, not from the DataSource.
 *
 * @param queryRunner - Active QueryRunner with transaction
 * @param entitySchema - Entity schema to get repository for
 * @returns Repository bound to the transaction
 *
 * @example
 * const queryRunner = await createTestTransaction();
 * try {
 *   const repo = getTransactionRepository(queryRunner, ProjectSchema);
 *   await repo.save({...}); // This will be part of the transaction
 *   await queryRunner.commitTransaction();
 * } catch (error) {
 *   await queryRunner.rollbackTransaction();
 * } finally {
 *   await queryRunner.release();
 * }
 */
export const getTransactionRepository = <T>(
  queryRunner: QueryRunner,
  entitySchema: unknown,
): Repository<T> => {
  return queryRunner.manager.getRepository(entitySchema as never);
};

/**
 * Jest setup helper - initialize database before all tests
 */
export const setupIntegrationTest = async (): Promise<void> => {
  await setupTestDatabase();
};

/**
 * Jest teardown helper - cleanup database after all tests
 */
export const teardownIntegrationTest = async (): Promise<void> => {
  await teardownTestDatabase();
};

/**
 * Jest beforeEach helper - clear database before each test
 */
export const setupEachTest = async (): Promise<void> => {
  await clearTestDatabase();
};

/**
 * Create test transaction for rollback testing
 *
 * IMPORTANT: All database operations within the transaction MUST use
 * the QueryRunner's manager. Use getTransactionRepository() to get
 * repositories bound to this transaction.
 *
 * @returns QueryRunner with active transaction
 *
 * @example
 * const queryRunner = await createTestTransaction();
 * try {
 *   // Get repository from transaction
 *   const projectRepo = getTransactionRepository(queryRunner, ProjectSchema);
 *
 *   // All operations use the transaction
 *   const project = await projectRepo.save({name: 'Test'});
 *
 *   // Commit if successful
 *   await queryRunner.commitTransaction();
 * } catch (error) {
 *   // Rollback on error
 *   await queryRunner.rollbackTransaction();
 *   throw error;
 * } finally {
 *   // Always release the query runner
 *   await queryRunner.release();
 * }
 */
export const createTestTransaction = async (): Promise<QueryRunner> => {
  const dataSource = getTestDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  return queryRunner;
};

/**
 * Rollback test transaction and release connection
 * @param queryRunner - QueryRunner to rollback
 */
export const rollbackTestTransaction = async (
  queryRunner: QueryRunner,
): Promise<void> => {
  await queryRunner.rollbackTransaction();
  await queryRunner.release();
};

/**
 * Commit test transaction and release connection
 * @param queryRunner - QueryRunner to commit
 */
export const commitTestTransaction = async (
  queryRunner: QueryRunner,
): Promise<void> => {
  await queryRunner.commitTransaction();
  await queryRunner.release();
};
