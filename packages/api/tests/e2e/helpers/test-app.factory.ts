import {INestApplication, ValidationPipe} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {AppModule} from '../../../src/app.module.js';
import {MockJwtStrategy} from './auth.helper.js';
import {DataSource} from 'typeorm';

/**
 * Create a NestJS application configured for E2E testing
 * - Uses in-memory SQLite database
 * - Mocks JWT authentication
 * - Applies same configuration as production app
 */
export async function createTestApp(): Promise<INestApplication> {
  // Create test module with AppModule and override JWT strategy
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('JwtStrategy')
    .useClass(MockJwtStrategy)
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
