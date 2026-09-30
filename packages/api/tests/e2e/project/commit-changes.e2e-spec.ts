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

describe('E2E: POST /projects/:projectId/commit-changes', () => {
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
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(403);
  }, 120_000);

  it('accepts an omitted body and records a zero-count commit', async () => {
    const projectId = await uploadProject();
    await startSession(projectId);

    const response = await request(
      httpServer as Parameters<typeof request>[0],
    )
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.data).toEqual({
      commitId: expect.any(Number),
      appliedEntityCount: 0,
      appliedAggregateCount: 0,
    });
  }, 120_000);

  it('accepts an empty body and a second apply creates a new empty commit', async () => {
    const projectId = await uploadProject();
    await startSession(projectId);

    const first = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(200);
    const second = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/commit-changes`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(200);

    expect(second.body.data).toMatchObject({
      appliedEntityCount: 0,
      appliedAggregateCount: 0,
    });
    expect(second.body.data.commitId).toBeGreaterThan(
      first.body.data.commitId as number,
    );
  }, 120_000);

  it('rejects legacy changeIds and message fields', async () => {
    const projectId = await uploadProject();
    await startSession(projectId);
    const endpoint = `/arc-api/v1/projects/${projectId}/commit-changes`;

    await request(httpServer as Parameters<typeof request>[0])
      .post(endpoint)
      .set('Authorization', `Bearer ${authToken}`)
      .send({changeIds: ['1']})
      .expect(400);
    await request(httpServer as Parameters<typeof request>[0])
      .post(endpoint)
      .set('Authorization', `Bearer ${authToken}`)
      .send({message: 'subjective text'})
      .expect(400);
  }, 120_000);
});
