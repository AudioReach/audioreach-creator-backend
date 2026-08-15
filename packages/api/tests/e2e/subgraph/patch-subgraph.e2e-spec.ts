/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function uploadProject(
  httpServer: unknown,
  authToken: string,
): Promise<string> {
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

async function startDesignerSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/start-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({mode: 'DESIGNER'})
    .timeout(30_000)
    .expect(201);
}

async function endSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/end-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);
}

async function getFirstSubgraphId(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<number> {
  const usecasesRes = await request(httpServer as Parameters<typeof request>[0])
    .get(`/arc-api/v1/projects/${projectId}/usecases`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const usecases: any[] = usecasesRes.body?.data ?? [];
  if (usecases.length === 0) throw new Error('Fixture has no usecases');

  const firstUsecase = usecases[0];
  const usecaseId = firstUsecase.usecaseId ?? firstUsecase.systemId;

  const componentsRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .get(`/arc-api/v1/projects/${projectId}/usecases/${usecaseId}/components`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const subgraphs: any[] = componentsRes.body?.data?.subgraphs ?? [];
  if (subgraphs.length === 0) throw new Error('Fixture has no subgraphs');

  return subgraphs[0].systemId as number;
}

describe('E2E: PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let subgraphSystemId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    subgraphSystemId = await getFirstSubgraphId(
      httpServer,
      authToken,
      projectId,
    );
  }, 180_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  beforeEach(async () => {
    await startDesignerSession(httpServer, authToken, projectId);
  }, 30_000);

  afterEach(async () => {
    await endSession(httpServer, authToken, projectId);
  }, 30_000);

  // ── 403: no active session ─────────────────────────────────────────────────

  it('returns 403 when no active session exists for the project', async () => {
    await endSession(httpServer, authToken, projectId);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({name: 'should-fail'})
      .timeout(30_000);
    expect(res.status).toBe(403);
    // Restart so afterEach cleanup works
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 403: wrong session mode ────────────────────────────────────────────────

  it('returns 403 when session mode is TUNING (not DESIGNER or DIFF_MERGE)', async () => {
    await endSession(httpServer, authToken, projectId);
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'TUNING'})
      .timeout(30_000)
      .expect(201);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({name: 'should-fail'})
      .timeout(30_000);
    expect(res.status).toBe(403);
    // Switch back to DESIGNER so afterEach can end-session cleanly
    await endSession(httpServer, authToken, projectId);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 400: no fields ─────────────────────────────────────────────────────────

  it('returns 400 when request body has no fields', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .timeout(30_000);
    expect(res.status).toBe(400);
  }, 60_000);

  // ── 404: subgraph not found ────────────────────────────────────────────────

  it('returns 404 when subgraphSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/subgraphs/99999999`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({name: 'ghost'})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 200: success ───────────────────────────────────────────────────────────

  it('returns 200 with properties array when name is updated', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({name: 'patched-subgraph-name'})
      .timeout(30_000);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.properties)).toBe(true);
  }, 60_000);
});
