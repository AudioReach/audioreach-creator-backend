/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

describe('Link query validation E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
  });

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('rejects the legacy subgraph filter on data-links', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects/1/data-links')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        subgraphSystemId: '501',
        moduleSystemId: '101',
        portSystemId: '1001',
      })
      .expect(400);
  });

  it('requires both module and port IDs on data-links', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects/1/data-links')
      .set('Authorization', `Bearer ${authToken}`)
      .query({moduleSystemId: '101'})
      .expect(400);
  });

  it('requires both module and port IDs on control-links', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects/1/control-links')
      .set('Authorization', `Bearer ${authToken}`)
      .query({portSystemId: '1001'})
      .expect(400);
  });

  it('requires subgraphSystemId on subgraph-links', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects/1/subgraph-links')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);
  });

  it('rejects an invalid optional peer ID on subgraph-links', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects/1/subgraph-links')
      .set('Authorization', `Bearer ${authToken}`)
      .query({subgraphSystemId: '501', subgraphPeerSystemId: 'invalid'})
      .expect(400);
  });
});
