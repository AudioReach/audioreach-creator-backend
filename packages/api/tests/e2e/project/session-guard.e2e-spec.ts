/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('SessionGuard E2E', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 120_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  describe('POST /arc-api/v1/projects/:projectId/end-session', () => {
    it('returns 403 with SESSION_NOT_OPEN when no active session exists for the project', async () => {
      const response = await request(httpServer)
        .post('/arc-api/v1/projects/nonexistent-project-id/end-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
      });
      // SessionGuard throws ForbiddenException which AllExceptionsFilter maps to 403.
      // The body contains the "No active session for project" message.
      expect(response.body.message as string).toContain(
        'No active session for project',
      );
    });
  });
});
