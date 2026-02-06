import type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
import type {ProjectRepository} from './repositories/project/project.repostiory.js';

/**
 * Unit of Work pattern for managing database transactions and repository access.
 *
 * Lifecycle:
 * - Created by CommandBus with an active QueryRunner
 * - QueryRunner remains alive for the entire command execution
 * - Handlers control transaction boundaries via startTransaction/commit/rollback
 * - CommandBus releases QueryRunner after command completes
 */
export interface UnitOfWork {
  /**
   * Start a new transaction.
   * @throws Error if transaction is already active
   */
  startTransaction(): Promise<void>;

  /**
   * Commit the active transaction.
   * Note: QueryRunner remains alive after commit (CommandBus will release it)
   * @throws Error if no active transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the active transaction.
   * Note: QueryRunner remains alive after rollback (CommandBus will release it)
   * @throws Error if no active transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if a transaction is currently active.
   */
  isInTransaction(): boolean;

  /**
   * Get bulk import repository for file upload operations.
   * Uses shared QueryRunner from this UOW.
   */
  getBulkImportRepository(): BulkImportRepository;

  /**
   * Get project repository for project management operations.
   * Uses shared QueryRunner from this UOW.
   */
  getProjectRepository(): ProjectRepository;
}
