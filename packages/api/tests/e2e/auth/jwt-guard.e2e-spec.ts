/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('JWT Guard E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  // Use a lightweight guarded endpoint — no session needed, just tests the guard
  const GUARDED_URL = '/arc-api/v1/projects';

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return 401 when Authorization header is absent', async () => {
    await request(httpServer).get(GUARDED_URL).timeout(10000).expect(401);
  });

  it('should return 401 when token is malformed', async () => {
    await request(httpServer)
      .get(GUARDED_URL)
      .set('Authorization', 'Bearer not.a.valid.token')
      .timeout(10000)
      .expect(401);
  });

  it('should return 401 when Authorization scheme is wrong', async () => {
    await request(httpServer)
      .get(GUARDED_URL)
      .set('Authorization', `Basic ${authToken}`)
      .timeout(10000)
      .expect(401);
  });

  it('should not return 401 when a valid token is provided', async () => {
    const response = await request(httpServer)
      .get(GUARDED_URL)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(10000);

    expect(response.status).not.toBe(401);
  });
});
