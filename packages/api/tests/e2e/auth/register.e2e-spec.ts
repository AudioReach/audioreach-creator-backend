/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {JwtService} from '@nestjs/jwt';
import type {INestApplication} from '@nestjs/common';
import {JWT_SECRET} from '../../../src/presentation/rest/modules/authentication/dto/constants.js';
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

  it('puts the client name into the token', async () => {
    const response = await request(httpServer)
      .post('/arc-api/v1/auth/register')
      .send({clientName: 'audioreach-creator-ui'})
      .timeout(10000)
      .expect(201);

    const payload = new JwtService({secret: JWT_SECRET}).verify<{
      clientId: string;
      clientName: string;
    }>(response.body.data.token as string);
    expect(payload).toMatchObject({
      clientId: response.body.data.clientId,
      clientName: 'audioreach-creator-ui',
    });
  });

  it.each([
    ['a non-string clientName', {clientName: 123}],
    ['a missing clientName', {}],
    ['an empty clientName', {clientName: ''}],
    ['an over-long clientName', {clientName: 'a'.repeat(257)}],
    ["the API's own service name", {clientName: 'audioreach-creator-api'}],
  ])('rejects %s with 400', async (_label, body) => {
    await request(httpServer)
      .post('/arc-api/v1/auth/register')
      .send(body)
      .timeout(10000)
      .expect(400);
  });

  it('rejects a token without clientName with 401', async () => {
    const token = new JwtService({secret: JWT_SECRET}).sign({
      clientId: 'issued-before-client-names',
    });

    const res = await request(httpServer)
      .get('/arc-api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .timeout(10000)
      .expect(401);
    expect(res.body).toMatchObject({
      errorCode: 'UnauthorizedException',
      message: 'Invalid token: missing clientId or clientName; register again',
    });
  });
});
