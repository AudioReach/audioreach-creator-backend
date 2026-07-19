/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UnitOfWork,
  BulkImportRepository,
  IdGenerationPort,
  ISessionRepository,
  ProjectRepository,
  ValidationPreferencesRepository,
  ValidationQueryRepository,
  WriteContext,
} from '@arc/core';
import type {QueryRunner, EntityManager} from 'typeorm';
import {
  TypeOrmBulkImportRepository,
  TypeOrmProjectRepository,
  TypeOrmValidationPreferencesRepository,
  TypeOrmValidationQueryRepository,
  TypeOrmSessionRepository,
} from '@arc/persistence';
import type {PendingChangeCache} from '@arc/persistence';

/**
 * TypeORM implementation of Unit of Work (LLD1 §8.5, §10.3, §14).
 *
 * Lifecycle:
 * 1. CommandBus creates QueryRunner and connects it
 * 2. CommandBus creates TypeOrmUnitOfWork via factory
 * 3. Handler uses UoW to manage transactions and access repositories
 * 4. CommandBus releases QueryRunner in finally block
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  private inTransaction: boolean = false;
  private _writeContext: WriteContext | null = null;

  constructor(
    private readonly queryRunner: QueryRunner,
    private readonly idGeneration: IdGenerationPort,
    private readonly pendingChangeCache: PendingChangeCache,
  ) {}

  async startTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error(
        'Transaction already active. Call commit() or rollback() before starting a new transaction.',
      );
    }
    await this.queryRunner.startTransaction();
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) throw new Error('No active transaction to commit');
    try {
      await this.queryRunner.commitTransaction();
    } finally {
      this.inTransaction = false;
    }
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction)
      throw new Error('No active transaction to rollback');
    try {
      await this.queryRunner.rollbackTransaction();
    } finally {
      this.inTransaction = false;
    }
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  private getManager(): EntityManager {
    return this.queryRunner.manager;
  }

  // ── LLD1: WriteContext plumbing (§8.5) ────────────────────────────────────

  setWriteContext(ctx: WriteContext): void {
    this._writeContext = ctx;
  }

  getWriteContext(): WriteContext {
    if (this._writeContext === null) {
      throw new Error('WriteContext not set — is this a Case-3 command?');
    }
    return this._writeContext;
  }

  // ── LLD1: PendingChangeCache flush (§10.3) ────────────────────────────────

  async applyCachedActions(): Promise<void> {
    await this.pendingChangeCache.flush(this.queryRunner);

    if (!this.pendingChangeCache.isEmpty()) {
      throw new Error(
        'PendingChangeCache is non-empty after flush — rows were not persisted. ' +
          'This indicates a bug in PendingChangeCache.flush().',
      );
    }
  }

  // ── LLD1: Session repository (§7b, §14) ──────────────────────────────────

  getSessionRepository(): ISessionRepository {
    return new TypeOrmSessionRepository(this.queryRunner.manager);
  }

  // ── Existing repositories ─────────────────────────────────────────────────

  getBulkImportRepository(): BulkImportRepository {
    return new TypeOrmBulkImportRepository(
      this.getManager(),
      this.idGeneration,
    );
  }

  getProjectRepository(): ProjectRepository {
    return new TypeOrmProjectRepository(this.queryRunner.manager);
  }

  getValidationPreferencesRepository(): ValidationPreferencesRepository {
    return new TypeOrmValidationPreferencesRepository(
      this.queryRunner.manager.connection,
    );
  }

  getValidationQueryService(): ValidationQueryRepository {
    return new TypeOrmValidationQueryRepository(
      this.queryRunner.manager.connection,
    );
  }
}
