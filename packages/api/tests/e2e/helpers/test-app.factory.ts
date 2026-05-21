/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {INestApplication, ValidationPipe} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {AppModule} from '../../../src/app.module.js';
import {MockJwtStrategy} from './auth.helper.js';
import {DataSource} from 'typeorm';
import {NodeWorkerPoolSingleton} from '@arc/fs';
import {DataSourceProvider} from '../../../src/infrastructure-wrapper/database/providers/data-source-provider.js';

/**
 * Create a proxy app that connects to an external running server
 * Used for debugging scenarios where the server is running separately
 */
export function createExternalServerApp(
  serverUrl: string = 'http://localhost:3000',
): INestApplication {
  // Create a minimal proxy object that satisfies INestApplication interface
  const proxyApp = {
    getHttpServer: () => serverUrl,
    get: () => null,
    close: async () => {
      // No-op for external server
    },
    init: async () => proxyApp,
    // Add other required methods as no-ops
    use: () => proxyApp,
    enableCors: () => proxyApp,
    useGlobalPipes: () => proxyApp,
    useGlobalFilters: () => proxyApp,
    useGlobalInterceptors: () => proxyApp,
    useGlobalGuards: () => proxyApp,
    listen: async () => undefined,
    getUrl: async () => serverUrl,
    setGlobalPrefix: () => proxyApp,
    useWebSocketAdapter: () => proxyApp,
    connectMicroservice: () => proxyApp,
    getMicroservices: () => [],
    startAllMicroservices: async () => undefined,
    select: () => ({}) as any,
    resolve: async () => undefined,
    registerRequestByContextId: () => undefined,
  } as unknown as INestApplication;

  return proxyApp;
}

/**
 * Create a NestJS application configured for E2E testing
 * - Uses in-memory SQLite database (unique per test suite)
 * - Mocks JWT authentication
 * - Applies same configuration as production app
 *
 * Note: Each test suite gets its own DataSource instance by overriding
 * the DataSourceProvider, which allows parallel test execution.
 */
export async function createTestApp(): Promise<INestApplication> {
  // Create a custom DataSourceProvider that doesn't use singleton pattern
  class TestDataSourceProvider extends DataSourceProvider {
    private testInstance: DataSource | null = null;

    async getDataSource(): Promise<DataSource> {
      if (this.testInstance) {
        return this.testInstance;
      }

      // Create a new DataSource for this test suite (not using static singleton class)
      const newDataSource = (this as any).createDataSource() as DataSource;
      await newDataSource.initialize();

      // Use synchronize instead of migrations for test isolation
      await newDataSource.synchronize();

      this.testInstance = newDataSource;
      return newDataSource;
    }

    async onModuleDestroy() {
      if (this.testInstance?.isInitialized) {
        await this.testInstance.destroy();
        this.testInstance = null;
      }
    }
  }

  // Create test module with AppModule and override providers
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('JwtStrategy')
    .useClass(MockJwtStrategy)
    .overrideProvider(DataSourceProvider)
    .useClass(TestDataSourceProvider)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply same configuration as main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Initialize the application
  await app.init();

  return app;
}

/**
 * Create a test app with in-memory database
 * This version explicitly configures the database for testing
 */
export async function createTestAppWithInMemoryDb(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('JwtStrategy')
    .useClass(MockJwtStrategy)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Get DataSource and ensure it's using in-memory database
  const dataSource = app.get(DataSource);

  // Run migrations if needed
  if (dataSource.isInitialized) {
    await dataSource.runMigrations();
  }

  await app.init();

  return app;
}

/**
 * Clean up test app and close all connections
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  if (app) {
    // Get DataSource and close connection
    try {
      const dataSource = app.get(DataSource);
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
    } catch (error) {
      // DataSource might not be available, ignore
    }

    // Dispose worker pool to terminate worker threads
    try {
      const workerPool = new NodeWorkerPoolSingleton();
      await workerPool.dispose();
    } catch (error) {
      // Worker pool might not be initialized, ignore
    }

    await app.close();
  }
}

/**
 * Reset database to clean state
 * Useful for running multiple tests with fresh data
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);

  if (dataSource?.isInitialized) {
    // Drop all tables and re-run migrations
    await dataSource.dropDatabase();
    await dataSource.synchronize();
  }
}
