/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('Client registration E2E', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('accepts clientName in the registration request', async () => {
    const response = await request(httpServer)
      .post('/arc-api/v1/auth/register')
      .send({clientName: 'audioreach-creator-ui'})
      .timeout(10000)
      .expect(201);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        clientId: expect.any(String),
        clientName: 'audioreach-creator-ui',
        token: expect.any(String),
      }),
    );
    expect(response.body).not.toHaveProperty('success');
    expect(response.body).not.toHaveProperty('message');
    expect(response.body).not.toHaveProperty('issues');
  });

  it('rejects a non-string clientName', async () => {
    await request(httpServer)
      .post('/arc-api/v1/auth/register')
      .send({clientName: 123})
      .timeout(10000)
      .expect(400);
  });
});
