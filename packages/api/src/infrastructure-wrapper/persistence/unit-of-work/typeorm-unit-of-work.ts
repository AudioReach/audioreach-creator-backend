/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UnitOfWork,
  BulkImportRepository,
  ProjectRepository,
  IdGenerationPort,
} from '@arc/core';
import type {QueryRunner, EntityManager} from 'typeorm';
import {
  TypeOrmBulkImportRepository,
  TypeOrmProjectRepository,
} from '@arc/persistence';

/**
 * TypeORM implementation of Unit of Work.
 *
 * Lifecycle:
 * 1. CommandBus creates QueryRunner and connects it
 * 2. CommandBus creates TypeOrmUnitOfWork with QueryRunner
 * 3. Handler uses UOW to manage transactions and access repositories
 * 4. CommandBus releases QueryRunner in finally block
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  private inTransaction: boolean = false;

  /**
   * @param queryRunner - Active QueryRunner injected by CommandBus
   * @param idGeneration - ID generation port shared from the application layer
   */
  constructor(
    private readonly queryRunner: QueryRunner,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async startTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error(
        'Transaction already active. ' +
          'Call commit() or rollback() before starting a new transaction.',
      );
    }

    await this.queryRunner.startTransaction();
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No active transaction to commit');
    }

    await this.queryRunner.commitTransaction();
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No active transaction to rollback');
    }

    await this.queryRunner.rollbackTransaction();
    this.inTransaction = false;
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  private getManager(): EntityManager {
    return this.queryRunner.manager;
  }

  getBulkImportRepository(): BulkImportRepository {
    return new TypeOrmBulkImportRepository(
      this.getManager(),
      this.idGeneration,
    );
  }

  getProjectRepository(): ProjectRepository {
    return new TypeOrmProjectRepository(this.getManager());
  }
}
