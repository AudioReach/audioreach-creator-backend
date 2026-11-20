/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('POST /arc-api/v1/projects/:projectId/validate — request handling', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 30000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 400 for a group that is not defined', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/1/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({group: 'NOPE'});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric projectId', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/abc/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for a project that does not exist', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/999999/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
