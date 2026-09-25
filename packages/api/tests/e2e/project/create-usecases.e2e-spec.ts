/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Create usecases endpoint E2E', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    const uploaded = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300000)
      .expect(201);
    projectId = uploaded.body.data.projectId as string;
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);
  }, 350000);

  afterAll(async () => {
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .then(() => undefined)
      .catch(() => undefined);
    await teardownE2ETest(app);
  });

  it('activates automatic routing and returns the unified response contract', async () => {
    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/create-usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({selectedUsecaseSystemIds: [], activeSubgraphs: []})
      .expect(201);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        changes: expect.any(Array),
        issues: expect.any(Array),
        groupId: expect.any(String),
      }),
    );
  });
});
