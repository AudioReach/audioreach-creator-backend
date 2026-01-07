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
 * Clears all tables by temporarily disabling foreign key constraints
 */
export const clearTestDatabase = async (): Promise<void> => {
  if (!testDataSource || !testDataSource.isInitialized) {
    throw new Error('Test database not initialized');
  }

  try {
    // Disable foreign key constraints to allow deleting in any order
    await testDataSource.query('PRAGMA foreign_keys = OFF');

    // Get all table names from metadata
    const tableNames = testDataSource.entityMetadatas.map(
      entity => entity.tableName,
    );

    for (const tableName of tableNames) {
      try {
        await testDataSource.query(`DELETE FROM "${tableName}"`);
      } catch (error) {
        // Table might not exist or other error, ignore to continue cleanup
        // console.warn(`Could not clear table ${tableName}:`, error);
      }
    }
  } finally {
    // Re-enable foreign key constraints
    await testDataSource.query('PRAGMA foreign_keys = ON');
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
