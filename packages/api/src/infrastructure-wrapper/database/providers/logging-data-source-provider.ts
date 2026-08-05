/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import type {OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {getLoggingOrmBase} from '@arc/logger';
import {getDatabasePath} from '../database-path.js';

@Injectable()
export class LoggingDataSourceProvider
  implements OnModuleInit, OnModuleDestroy
{
  private instance: DataSource | null = null;

  async onModuleInit(): Promise<void> {
    await this.getDataSource();
  }

  async getDataSource(): Promise<DataSource> {
    if (this.instance) {
      return this.instance;
    }
    this.instance = new DataSource({
      type: 'sqlite',
      database: getDatabasePath('logging.db'),
      ...getLoggingOrmBase(),
    });
    await this.instance.initialize();
    const hasPending = await this.instance.showMigrations();
    if (hasPending) {
      await this.instance.runMigrations({transaction: 'all'});
    }
    return this.instance;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) {
      await this.instance.destroy();
      this.instance = null;
    }
  }
}
