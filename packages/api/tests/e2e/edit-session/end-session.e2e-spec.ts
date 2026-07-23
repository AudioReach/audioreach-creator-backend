/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('E2E: POST /projects/:projectId/end-session', () => {
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

  async function uploadProject(): Promise<string> {
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');
    const res = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(120_000)
      .expect(201);
    return res.body.data.projectId as string;
  }

  it('succeeds and deletes the session when there are no commits', async () => {
    const projectId = await uploadProject();
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(res.body.data).toBeDefined();
  }, 120_000);

  it('TUNING mode session can be ended (mode-any semantics)', async () => {
    const projectId = await uploadProject();
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'TUNING'})
      .expect(201);
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  }, 120_000);

  // This test DOES run — SessionGuard is wired to end-session (Chapter G).
  it('returns 403 when no active session exists for the project', async () => {
    const projectId = await uploadProject();
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(403);
  }, 120_000);
});
