/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VOLUME_CONTROL_MODULE_ID = 0x0700101b;

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

async function findVolumeControlTkvData(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<{
  spfModuleSystemId: string;
  tagSystemId: string;
  tkvSystemId: string;
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

  let spfModuleSystemId: string | undefined;
  let tagSystemId: string | undefined;
  let tkvSystemId: string | undefined;

  outer: for (const ucId of ucIds) {
    const componentsRes = await request(
      httpServer as Parameters<typeof request>[0],
    )
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [ucId]})
      .timeout(30_000);

    if (componentsRes.status < 200 || componentsRes.status >= 300) continue;

    const spfModules: any[] = componentsRes.body.data?.spfModules ?? [];
    const moduleSystemIds = spfModules
      .map((m: any) => String(m.systemId))
      .filter(Boolean);

    if (!moduleSystemIds.length) continue;

    const queryRes = await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query?include=tags`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: moduleSystemIds})
      .timeout(30_000);

    if (queryRes.status < 200 || queryRes.status >= 300) continue;

    const moduleDtos: any[] = queryRes.body.data ?? [];
    for (const moduleDto of moduleDtos) {
      if (moduleDto.moduleId === VOLUME_CONTROL_MODULE_ID) {
        const tags: any[] = moduleDto.tags ?? [];
        const tagWithTkv = tags.find((t: any) => (t.tkvs ?? []).length > 0);
        if (!tagWithTkv) continue;
        spfModuleSystemId = String(moduleDto.systemId);
        tagSystemId = String(tagWithTkv.systemId);
        tkvSystemId = String(tagWithTkv.tkvs[0].systemId);
        break outer;
      }
    }
  }

  if (!spfModuleSystemId || !tagSystemId || !tkvSystemId) {
    throw new Error(
      'VOLUME_CONTROL module (0x0700101B) with TKV data not found in fixture',
    );
  }

  const calDataRes = await request(httpServer as Parameters<typeof request>[0])
    .get(
      `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
    )
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000)
    .expect(200);

  const parameters: any[] = calDataRes.body?.data?.parameters ?? [];
  if (parameters.length === 0) {
    throw new Error('VOLUME_CONTROL TKV has no calibration parameters');
  }

  return {spfModuleSystemId, tagSystemId, tkvSystemId, parameters};
}

// ── Input-validation + auth tests (no session needed) ────────────────────────

describe('PUT tag-data — input validation', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 350_000);

  afterAll(async () => {
    await endSession(httpServer, authToken, projectId);
    await teardownE2ETest(app);
  });

  it('returns 400 for non-numeric spfModuleSystemId', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/not-a-number/tag-data/1/1`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: [{}]});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tagSystemId', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/1/tag-data/not-a-number/1`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: [{}]});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tkvSystemId', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/1/tag-data/1/not-a-number`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: [{}]});
    expect(res.status).toBe(400);
  });

  it('returns 403 when no active session', async () => {
    await endSession(httpServer, authToken, projectId);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(`/arc-api/v1/projects/${projectId}/spf-modules/1/tag-data/1/1`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: []});
    expect(res.status).toBe(403);
    await startDesignerSession(httpServer, authToken, projectId);
  });
});

// ── Golden path (VOLUME_CONTROL, Designer session) ────────────────────────────

describe('PUT tag-data for VOLUME_CONTROL module (moduleId=0x0700101B)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let spfModuleSystemId: string;
  let tagSystemId: string;
  let tkvSystemId: string;
  let roundTripParams: any[];

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    ({
      spfModuleSystemId,
      tagSystemId,
      tkvSystemId,
      parameters: roundTripParams,
    } = await findVolumeControlTkvData(httpServer, authToken, projectId));

    const rawFallbackCount = roundTripParams.filter(
      (p: any) =>
        p.elements.length === 1 &&
        p.elements[0].name === 'Failed to parse payload',
    ).length;
    if (rawFallbackCount > 0) {
      throw new Error(
        `GET returned ${rawFallbackCount} rawFallback parameter(s) for VOLUME_CONTROL TKV — ` +
          `fix elementsStructure canonicalization before running round-trip tests`,
      );
    }

    await startDesignerSession(httpServer, authToken, projectId);
  }, 350_000);

  afterAll(async () => {
    await endSession(httpServer, authToken, projectId);
    await teardownE2ETest(app);
  });

  // ── 403: no active session ────────────────────────────────────────────────

  it('returns 403 when no active session exists for the project', async () => {
    await endSession(httpServer, authToken, projectId);
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(403);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  // ── 404: spfModuleSystemId not found ─────────────────────────────────────

  it('returns 404 when spfModuleSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/999999999/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 404: tagSystemId not found ────────────────────────────────────────────

  it('returns 404 when tagSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/999999999/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 404: tkvSystemId not found ────────────────────────────────────────────

  it('returns 404 when tkvSystemId does not exist', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(404);
  }, 60_000);

  // ── 200: all parameters succeed ───────────────────────────────────────────

  it('returns 200 with TkvCalDataDto when all parameters succeed (round-trip)', async () => {
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams})
      .timeout(30_000);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.parameters)).toBe(true);
    expect(res.body.data.parameters.length).toBeGreaterThan(0);
    expect(res.body.issues ?? []).toHaveLength(0);

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
        roundTripParams[0],
        {systemId: '999999999', elements: roundTripParams[0].elements},
      ],
    };
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
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
        {systemId: '999999998', elements: roundTripParams[0].elements},
        {systemId: '999999999', elements: roundTripParams[0].elements},
      ],
    };
    const res = await request(httpServer as Parameters<typeof request>[0])
      .put(
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
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
        `/arc-api/v1/projects/${projectId}/spf-modules/${spfModuleSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({parameters: roundTripParams, uiPersistence: 'pregain=0x0000'})
      .timeout(30_000);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.issues ?? []).toHaveLength(0);
  }, 60_000);
});
