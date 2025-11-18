import type {
  UnitOfWork,
  BulkImportRepository,
  ProjectRepository,
} from '@arc/core';
import {DataSource} from 'typeorm';
import type {QueryRunner} from 'typeorm';
import {TypeOrmBulkImportRepository} from '@arc/persistence';
import {TypeOrmProjectRepository} from '@arc/persistence';

export class TypeOrmUnitOfWork implements UnitOfWork {
  private currentQueryRunner: QueryRunner | null = null;

  constructor(private dataSource: DataSource) {}

  async executeInTransaction<T>(task: () => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Store the query runner in this instance
      this.currentQueryRunner = queryRunner;

      const result = await task();

      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Clear the query runner and release it
      this.currentQueryRunner = null;
      await queryRunner.release();
    }
  }

  // Method to check if currently in transaction
  isInTransaction(): boolean {
    return this.currentQueryRunner !== null;
  }

  getBulkImportRepository(): BulkImportRepository {
    // Always create a new QueryRunner for bulk import operations
    const queryRunner = this.dataSource.createQueryRunner();
    return new TypeOrmBulkImportRepository(queryRunner);
  }

  getProjectRepository(): ProjectRepository {
    // Always create a new QueryRunner for bulk import operations
    //const queryRunner = this.dataSource.createQueryRunner();
    return new TypeOrmProjectRepository(this.dataSource);
  }
}
