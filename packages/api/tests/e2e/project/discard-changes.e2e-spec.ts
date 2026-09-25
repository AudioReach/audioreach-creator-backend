/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';
import type {INestApplication} from '@nestjs/common';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import request from 'supertest';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe('E2E: POST /projects/:projectId/discard-changes', () => {
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
    const response = await request(httpServer as Parameters<typeof request>[0])
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(currentDirectory, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(currentDirectory, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(120_000)
      .expect(201);
    return response.body.data.projectId as string;
  }

  async function startSession(projectId: string): Promise<void> {
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);
  }

  it('returns 403 when the project has no active session', async () => {
    const projectId = await uploadProject();

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/discard-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(403);
  }, 120_000);

  it('discards an empty active session successfully', async () => {
    const projectId = await uploadProject();
    await startSession(projectId);

    const response = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/discard-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.data).toEqual({discardedEditActionCount: 0});
  }, 120_000);

  it('rejects selective discard fields', async () => {
    const projectId = await uploadProject();
    await startSession(projectId);

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/discard-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({changeIds: ['1']})
      .expect(400);
  }, 120_000);
});
