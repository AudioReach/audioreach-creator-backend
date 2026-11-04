/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('Health E2E (GET /arc-api/v1/health)', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
  });

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return HTTP 200 with status ok, without an Authorization header', async () => {
    const response = await request(httpServer).get('/arc-api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({status: 'ok'});
  });
});
