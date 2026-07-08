/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {createTestApp} from '../helpers/test-app.factory.js';

describe('GET /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/cal-data/:ckvSystemId', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    // Sign with the same secret and required fields used by the real JwtStrategy
    authToken = jwt.sign(
      {sub: 'test-user-id', clientId: 'test-client', username: 'test-user'},
      'arc-web-api',
    );
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for non-numeric spfModuleSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/not-a-number/cal-data/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric ckvSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/1/cal-data/not-a-number')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid param-system-ids', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/arc-api/v1/projects/1/spf-modules/1/cal-data/1?param-system-ids=abc,2',
      )
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('accepts hex-format IDs (0x prefix) without 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/0x1/spf-modules/0x1/cal-data/0x1')
      .set('Authorization', `Bearer ${authToken}`);
    expect([200, 404, 422]).toContain(res.status);
  });
});
