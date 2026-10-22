/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe('E2E: apply and discard changes', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 120_000);

  afterAll(async () => teardownE2ETest(app));

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

  it('returns the approved empty-commit error and allows empty discard', async () => {
    const projectId = await uploadProject();
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);

    const commit = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(422);
    expect(commit.body.errorCode).toBe('NO_STAGED_CHANGES');

    const discard = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/discard-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(200);
    expect(discard.body).toEqual({});
  }, 120_000);

  it('rejects legacy selective request fields', async () => {
    const projectId = await uploadProject();
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);

    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({changeIds: ['1']})
      .expect(400);
  }, 120_000);
});
