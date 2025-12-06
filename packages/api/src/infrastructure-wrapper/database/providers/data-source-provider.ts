import {getOrmBase} from '@arc/persistence';
import type {Logger, LogData} from '@arc/core';
import {Injectable, Inject} from '@nestjs/common';
import type {OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {getDatabasePath} from '../database-path.js';
import {NodeBlobBytesConverter} from '../node-blob-converter.js';
import {DataSource} from 'typeorm';

@Injectable()
export class DataSourceProvider implements OnModuleInit, OnModuleDestroy {
  private static instance: DataSource | null = null;

  constructor(
    /*private configService: ConfigService,*/
    @Inject('LOGGER') private logger: Logger,
  ) {}

  async onModuleInit() {
    await this.getDataSource();
  }

  async getDataSource(): Promise<DataSource> {
    if (DataSourceProvider.instance) {
      return DataSourceProvider.instance;
    }

    this.logInfo('Creating and initializing DataSource...');

    DataSourceProvider.instance = this.createDataSource();
    await DataSourceProvider.instance.initialize();

    await this.runMigrations(DataSourceProvider.instance);

    this.logInfo('DataSource initialized successfully');

    return DataSourceProvider.instance;
  }

  private createDataSource(): DataSource {
    const blobConverter = new NodeBlobBytesConverter();
    const base = getOrmBase(blobConverter);

    return new DataSource({
      type: 'sqlite',
      database: getDatabasePath(/*this.configService*/),
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
    if (DataSourceProvider.instance) {
      this.logInfo('Closing DataSource connection...');
      await DataSourceProvider.instance.destroy();
      DataSourceProvider.instance = null;
    }
  }

  private logInfo(msg: string): void {
    const logData: LogData = {
      msg,
      timestamp: new Date(),
      action: 'database_initialization',
      component: 'DataSourceProvider',
      tag: 'database',
    };
    this.logger.logInfo(logData);
  }

  private logError(msg: string, error: Error): void {
    const logData: LogData = {
      msg,
      timestamp: new Date(),
      action: 'database_initialization',
      component: 'DataSourceProvider',
      tag: 'database',
      error,
    };
    this.logger.logError(logData);
  }
}
