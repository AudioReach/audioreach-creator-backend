/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {INestApplication} from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  resetDatabase,
} from './test-app.factory.js';
import {generateMockJwtToken} from './auth.helper.js';

/**
 * Setup helper for E2E tests
 * Creates a test application with in-memory database and mock authentication
 *
 * @returns Object containing the app instance, HTTP server, and auth token
 */
export async function setupE2ETest(): Promise<{
  app: INestApplication;
  httpServer: any;
  authToken: string;
}> {
  const app = await createTestApp();
  const httpServer = app.getHttpServer();
  const authToken = generateMockJwtToken();

  return {app, httpServer, authToken};
}

/**
 * Teardown helper for E2E tests
 * Properly closes the application and cleans up resources
 *
 * @param app - The NestJS application instance to close
 */
export async function teardownE2ETest(app: INestApplication): Promise<void> {
  await closeTestApp(app);
}

/**
 * Reset the database to a clean state
 * Useful for tests that need a fresh database between test cases
 *
 * @param app - The NestJS application instance
 */
export async function resetTestDatabase(app: INestApplication): Promise<void> {
  await resetDatabase(app);
}
