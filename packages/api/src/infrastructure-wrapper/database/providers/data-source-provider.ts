/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {getOrmBase} from '@arc/persistence';
import type {Logger} from '@arc/core';
import {Injectable, Inject} from '@nestjs/common';
import type {OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {getDatabasePath} from '../database-path.js';
import {NodeBlobBytesConverter} from '../node-blob-converter.js';
import {DataSource} from 'typeorm';

@Injectable()
export class DataSourceProvider implements OnModuleInit, OnModuleDestroy {
  private instance: DataSource | null = null;

  constructor(
    /*private configService: ConfigService,*/
    @Inject('LOGGER') private logger: Logger,
  ) {}

  async onModuleInit() {
    await this.getDataSource();
  }

  async getDataSource(): Promise<DataSource> {
    if (this.instance) {
      return this.instance;
    }

    this.logInfo('Creating and initializing DataSource...');

    this.instance = this.createDataSource();
    await this.instance.initialize();

    await this.runMigrations(this.instance);

    this.logInfo('DataSource initialized successfully');

    return this.instance;
  }

  private createDataSource(): DataSource {
    const blobConverter = new NodeBlobBytesConverter();
    const base = getOrmBase(blobConverter);

    return new DataSource({
      type: 'sqlite',
      database: getDatabasePath('database.db'),
      ...base,
      extra: {
        connectionLimit: 10,
        acquireTimeout: 60_000,
        timeout: 60_000,
      },
    });
  }

  private async runMigrations(dataSource: DataSource): Promise<void> {
    try {
      const hasPending = await dataSource.showMigrations();
      this.logInfo(`Pending migrations: ${hasPending ? 'YES' : 'NO'}`);

      if (!hasPending) return;

      const results = await dataSource.runMigrations({transaction: 'all'});
      if (results.length === 0) {
        this.logInfo('No migrations were applied.');
      } else {
        for (const result of results) {
          this.logInfo(`Applied migration: ${result.name}`);
        }
      }
    } catch (error) {
      this.logError('Failed to run migrations', error as Error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.instance) {
      this.logInfo('Closing DataSource connection...');
      await this.instance.destroy();
      this.instance = null;
    }
  }

  private logInfo(msg: string): void {
    this.logger.logInfo({
      msg: 'database_initialization',
      description: msg,
      component: 'DataSourceProvider',
      tag: 'database',
    });
  }

  private logError(msg: string, error: Error): void {
    this.logger.logError({
      msg: 'database_initialization',
      description: msg,
      component: 'DataSourceProvider',
      tag: 'database',
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
