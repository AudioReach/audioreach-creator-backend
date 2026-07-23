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

async function getFirstModuleId(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<number> {
  const usecasesRes = await request(httpServer as Parameters<typeof request>[0])
    .get(`/arc-api/v1/projects/${projectId}/usecases/`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);
  const usecases: any[] = usecasesRes.body?.data ?? [];

  // Flatten all usecase systemIds (same logic as query-spf-modules.e2e-spec.ts)
  const ucIds: string[] = [];
  for (const uc of usecases) {
    const inner: any[] = uc.usecases ?? [];
    for (const u of inner) {
      if (u.systemId) ucIds.push(String(u.systemId));
    }
    if (!inner.length && uc.systemId) ucIds.push(String(uc.systemId));
  }
  if (ucIds.length === 0) throw new Error('Fixture has no usecases');

  // Batch query all usecases at once
  const componentsRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: ucIds})
    .timeout(30_000);
  const modules: any[] = componentsRes.body?.data?.spfModules ?? [];
  if (modules.length === 0)
    throw new Error(
      `No modules found. usecasesRes=${JSON.stringify(usecasesRes.body?.data?.length)} ucIds=${ucIds.slice(0, 3).join(',')}`,
    );
  return modules[0].systemId as number;
}

describe('E2E: PATCH /arc-api/v1/projects/:projectId/spf-modules/:moduleId', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let moduleSystemId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    moduleSystemId = await getFirstModuleId(httpServer, authToken, projectId);
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
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({alias: 'should-fail'})
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
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({alias: 'should-fail'})
      .timeout(30_000);
    expect(res.status).toBe(403);
    // Switch back to DESIGNER so afterEach can end-session cleanly
    await endSession(httpServer, authToken, projectId);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 400: no fields ─────────────────────────────────────────────────────────

  it('returns 400 when request body has no fields', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .timeout(30_000);
    expect(res.status).toBe(400);
  }, 60_000);

  // ── 404: module not found ──────────────────────────────────────────────────

  it('returns 404 when module systemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/99999999`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({alias: 'ghost'})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 422: domain rule violation ─────────────────────────────────────────────

  it('returns 422 with ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION when maxInputPortsSupported exceeds limit', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({maxInputPortsSupported: 999999})
      .timeout(30_000);
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues[0].code).toBe(
      'ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION',
    );
  }, 60_000);

  // ── 200: success ───────────────────────────────────────────────────────────

  it('returns 200 with updated alias in SpfModuleDto on successful alias patch', async () => {
    const newAlias = `e2e-alias-${Date.now()}`;
    const res = await request(httpServer as Parameters<typeof request>[0])
      .patch(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({alias: newAlias})
      .timeout(30_000);
    if (res.status !== 200)
      throw new Error(
        `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    expect(res.body.data).toBeDefined();
    expect(res.body.data.systemId).toBe(moduleSystemId);
    expect(res.body.data.alias).toBe(newAlias);
    expect(res.body.data.systemId).toBe(moduleSystemId);
    expect(res.body.data.alias).toBe(newAlias);
  }, 60_000);
});
