/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
import type {ProjectRepository} from './repositories/project/project.repository.js';
import type {ValidationPreferencesRepository} from './repositories/validation/validation-preferences.repository.js';
import type {ValidationQueryRepository} from './repositories/validation/validation-query.repository.js';

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

  /**
   * Get validation preferences repository.
   * Uses shared QueryRunner from this UOW.
   */
  getValidationPreferencesRepository(): ValidationPreferencesRepository;

  /**
   * Get validation query service for running validations from command handlers.
   * Provides read-only access to domain entities needed by ValidationContextBuilder.fromDb().
   * Uses the same DB connection as this UOW for consistency.
   *
   * Use this in command handlers (commit, save) that need to run validation
   * against DB-persisted entities. For the upload path, use fromEntities() instead.
   */
  getValidationQueryService(): ValidationQueryRepository;
}
