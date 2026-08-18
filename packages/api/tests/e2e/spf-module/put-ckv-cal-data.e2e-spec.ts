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

const IIR_MBDRC_MODULE_ID = 0x07001017;

/** Recursively extracts {name, value} from an element tree for round-trip comparison. */
function extractNameValues(elements: any[]): any[] {
  return elements.map((el: any) => {
    if (Array.isArray(el.value)) {
      return {name: el.name, value: extractNameValues(el.value)};
    }
    return {name: el.name, value: el.value};
  });
}

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

async function findIirMbdrcCalData(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<{
  spfModuleSystemId: string;
  ckvSystemId: string;
  parameters: any[];
}> {
  const usecasesRes = await request(httpServer as Parameters<typeof request>[0])
    .get(`/arc-api/v1/projects/${projectId}/usecases/`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);

  const usecases: any[] = usecasesRes.body?.data ?? [];
  const ucIds: string[] = [];
  for (const uc of usecases) {
    const inner: any[] = uc.usecases ?? [];
    for (const u of inner) {
      if (u.systemId) ucIds.push(String(u.systemId));
    }
    if (!inner.length && uc.systemId) ucIds.push(String(uc.systemId));
  }
  if (ucIds.length === 0) throw new Error('Fixture has no usecases');

  const componentsRes = await request(
    httpServer as Parameters<typeof request>[0],
  )
    .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: ucIds})
    .timeout(30_000);

  const spfModules: any[] = componentsRes.body?.data?.spfModules ?? [];
  const moduleSystemIds = spfModules.map((m: any) => String(m.systemId));

  if (moduleSystemIds.length === 0)
    throw new Error('No modules found in fixture');

  const queryRes = await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/spf-modules/query?include=ckvs`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({systemIds: moduleSystemIds})
    .timeout(30_000);

  const moduleDtos: any[] = queryRes.body?.data ?? [];
  let targetModule: any = moduleDtos.find(
    (m: any) => m.moduleId === IIR_MBDRC_MODULE_ID,
  );
  if (!targetModule)
    throw new Error('IIR_MBDRC module (0x07001017) not found in fixture');

  const spfModuleSystemId = String(targetModule.systemId);
  const ckvs: any[] = targetModule.ckvs ?? [];
  if (ckvs.length === 0) throw new Error('IIR_MBDRC module has no CKVs');
  const ckvSystemId = String(ckvs[0].systemId);

  const calDataRes = await request(httpServer as Parameters<typeof request>[0])
    .get(
      `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
    )
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000)
    .expect(200);

  const parameters: any[] = calDataRes.body?.data?.parameters ?? [];
  if (parameters.length === 0)
    throw new Error('IIR_MBDRC CKV has no calibration parameters');

  return {spfModuleSystemId, ckvSystemId, parameters};
}

describe('PUT /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/cal-data/:ckvSystemId', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let spfModuleSystemId: string;
  let ckvSystemId: string;
  let parameters: any[];
  let roundTripParams: any[];

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    ({spfModuleSystemId, ckvSystemId, parameters} = await findIirMbdrcCalData(
      httpServer,
      authToken,
      projectId,
    ));
    // All parameters must parse successfully. A rawFallback entry (single element
    // named 'Failed to parse payload') means binary parsing failed — that is a bug
    // that must be fixed before round-trip tests are meaningful.
    const rawFallbackCount = parameters.filter(
      (p: any) =>
        p.elements.length === 1 &&
        p.elements[0].name === 'Failed to parse payload',
    ).length;
    if (rawFallbackCount > 0) {
      throw new Error(
        `GET returned ${rawFallbackCount} rawFallback parameter(s) for IIR_MBDRC — ` +
          `fix elementsStructure canonicalization before running round-trip tests`,
      );
    }
    roundTripParams = parameters;
    // Start a shared designer session. Write tests (200, 207-partial, uiPersistence)
    // leave staged edit_actions rows that block end-session (422). Since commit-changes
    // and discard-changes are not yet implemented, we share one session for the entire
    // suite and rely on teardownE2ETest to clean up the DB.
    await startDesignerSession(httpServer, authToken, projectId);
  }, 350_000);

  afterAll(async () => {
    // Best-effort: may return 422 if staged changes exist (not yet discardable).
    await endSession(httpServer, authToken, projectId);
    await teardownE2ETest(app);
  });

  // ── 403: no active session ────────────────────────────────────────────────

  it('returns 403 when no active session exists for the project', async () => {
    await endSession(httpServer, authToken, projectId);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters})
      .timeout(30_000);
    expect(res.status).toBe(403);
    // Restart session so subsequent tests have an active session.
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 404: spfModuleSystemId not found ─────────────────────────────────────

  it('returns 404 when spfModuleSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/999999999/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 404: ckvSystemId not found ────────────────────────────────────────────

  it('returns 404 when ckvSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 200: all parameters succeed ───────────────────────────────────────────

  it('returns 200 with CalDataDto when all parameters succeed (round-trip)', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.parameters)).toBe(true);
    expect(res.body.data.parameters.length).toBeGreaterThan(0);
    expect(res.body.issues ?? []).toHaveLength(0);

    console.log(
      '[PUT round-trip] response DTO:\n',
      JSON.stringify(res.body.data, null, 2),
    );

    // Values must be preserved through the round-trip: each element's name and
    // value in the PUT response must match the original GET response.
    const putParams: any[] = res.body.data.parameters;
    for (const putParam of putParams) {
      const original = roundTripParams.find(
        (p: any) => p.systemId === putParam.systemId,
      );
      if (!original) continue;
      expect(extractNameValues(putParam.elements)).toEqual(
        extractNameValues(original.elements),
      );
    }
  }, 60_000);

  // ── 207: some parameters fail (no existing payload row) ──────────────────

  it('returns 207 when some parameter systemIds have no existing payload row', async () => {
    const body = {
      parameters: [
        roundTripParams[0], // valid — from GET
        {systemId: '999999999', elements: roundTripParams[0].elements}, // non-existent payload row
      ],
    };
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
      .timeout(30_000);
    expect(res.status).toBe(207);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(res.body.issues[0].code).toBe('PARAM_PAYLOAD_NOT_FOUND');
  }, 60_000);

  // ── 207: all parameters fail ──────────────────────────────────────────────

  it('returns 207 with no data when all parameter systemIds have no existing payload row', async () => {
    const body = {
      parameters: [
        {systemId: '999999998', elements: parameters[0].elements},
        {systemId: '999999999', elements: parameters[0].elements},
      ],
    };
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
      .timeout(30_000);
    expect(res.status).toBe(207);
    expect(res.body.data).toBeUndefined();
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBe(2);
    expect(
      res.body.issues.every((i: any) => i.code === 'PARAM_PAYLOAD_NOT_FOUND'),
    ).toBe(true);
  }, 60_000);

  // ── 200: uiPersistence written ────────────────────────────────────────────

  it('returns 200 when uiPersistence is provided alongside parameters', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams, uiPersistence: 'pregain=0x0000'})
      .timeout(30_000);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.issues ?? []).toHaveLength(0);
  }, 60_000);
});
