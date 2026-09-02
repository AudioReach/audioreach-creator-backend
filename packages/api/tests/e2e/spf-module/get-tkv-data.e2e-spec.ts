/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {createTestApp} from '../helpers/test-app.factory.js';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VOLUME_CONTROL_MODULE_ID = 0x0700101b;

describe('GET /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    authToken = jwt.sign(
      {sub: 'test-user-id', clientId: 'test-client', username: 'test-user'},
      'arc-web-api',
    );
  }, 30000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 400 for non-numeric spfModuleSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/not-a-number/tag-data/1/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tagSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/1/tag-data/not-a-number/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric tkvSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/1/tag-data/1/not-a-number')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid param-system-ids', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/arc-api/v1/projects/1/spf-modules/1/tag-data/1/1?param-system-ids=abc,2',
      )
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('accepts hex-format IDs (0x prefix) without 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/0x1/spf-modules/0x1/tag-data/0x1/0x1')
      .set('Authorization', `Bearer ${authToken}`);
    expect([200, 404, 422]).toContain(res.status);
  });
});

describe('GET tag-data for VOLUME_CONTROL module (moduleId=0x0700101B)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let volumeControlSystemId: string | undefined;
  let tagSystemId: string | undefined;
  let tkvSystemId: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    volumeControlSystemId = undefined;
    tagSystemId = undefined;
    tkvSystemId = undefined;

    // Upload fixture files to get a project with real module data
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000);

    if (!uploadResponse.body?.data?.projectId) {
      console.error(
        'Upload failed:',
        uploadResponse.status,
        JSON.stringify(uploadResponse.body),
      );
      return;
    }

    projectId = uploadResponse.body.data.projectId;

    // Get all usecases for this project
    const usecasesResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases/`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (usecasesResponse.status !== 200) return;

    const usecases = usecasesResponse.body.data ?? [];
    const usecaseSystemIds: string[] = [];

    for (const uc of usecases) {
      const inner: any[] = uc.usecases ?? [];
      for (const u of inner) {
        if (u.systemId) usecaseSystemIds.push(String(u.systemId));
      }
      if (!inner.length && uc.systemId) {
        usecaseSystemIds.push(String(uc.systemId));
      }
    }

    if (!usecaseSystemIds.length) return;

    // For each usecase, query its components to find VOLUME_CONTROL module instances
    outer: for (const usecaseSystemId of usecaseSystemIds) {
      const componentsResponse = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseSystemId]})
        .timeout(30000);

      if (componentsResponse.status < 200 || componentsResponse.status >= 300)
        continue;

      const spfModules: any[] = componentsResponse.body.data?.spfModules ?? [];
      const moduleSystemIds = spfModules
        .map((m: any) => String(m.systemId))
        .filter(Boolean);

      if (!moduleSystemIds.length) continue;

      // Query full SpfModuleDto (includes moduleId and tags with tkvs)
      const queryResponse = await request(httpServer)
        .post(
          `/arc-api/v1/projects/${projectId}/spf-modules/query?include=tags`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: moduleSystemIds})
        .timeout(30000);

      if (queryResponse.status < 200 || queryResponse.status >= 300) continue;

      const moduleDtos: any[] = queryResponse.body.data ?? [];
      for (const moduleDto of moduleDtos) {
        if (moduleDto.moduleId === VOLUME_CONTROL_MODULE_ID) {
          const tags: any[] = moduleDto.tags ?? [];
          const tagWithTkv = tags.find((t: any) => (t.tkvs ?? []).length > 0);
          if (!tagWithTkv) continue;
          volumeControlSystemId = String(moduleDto.systemId);
          tagSystemId = String(tagWithTkv.systemId);
          tkvSystemId = String(tagWithTkv.tkvs[0].systemId);
          console.log(
            `[Tag-Data E2E] Found VOLUME_CONTROL: systemId=${volumeControlSystemId}, tagSystemId=${tagSystemId}, tkvSystemId=${tkvSystemId}`,
          );
          break outer;
        }
      }
    }

    if (!volumeControlSystemId) {
      console.warn(
        '[Tag-Data E2E] VOLUME_CONTROL module (id=0x0700101B) with TKV data not found in fixture',
      );
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns HTTP 200 for VOLUME_CONTROL tag-data with first TKV', async () => {
    if (!projectId || !volumeControlSystemId || !tagSystemId || !tkvSystemId) {
      throw new Error(
        'VOLUME_CONTROL module (moduleId=0x0700101B) with TKV data not found in fixture',
      );
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();

    const params: any[] = response.body.data?.parameters ?? [];
    expect(params.length).toBeGreaterThan(0);

    const failedParse = params.filter(
      (p: any) =>
        p.elements.length === 1 &&
        p.elements[0].name === 'Failed to parse payload',
    );
    expect(failedParse).toHaveLength(0);
  });

  it('returns HTTP 200 with one parameter when filtered by param-system-ids', async () => {
    if (!projectId || !volumeControlSystemId || !tagSystemId || !tkvSystemId) {
      throw new Error(
        'VOLUME_CONTROL module (moduleId=0x0700101B) with TKV data not found in fixture',
      );
    }

    // First fetch all parameters to get a valid payload systemId
    const allResponse = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(allResponse.status).toBe(200);
    const allParams: any[] = allResponse.body.data?.parameters ?? [];
    expect(allParams.length).toBeGreaterThan(0);

    const firstParamSystemId = allParams[0].systemId;

    // Now fetch with the single payload PK as filter
    const filteredResponse = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-modules/${volumeControlSystemId}/tag-data/${tagSystemId}/${tkvSystemId}?param-system-ids=${firstParamSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(filteredResponse.status).toBe(200);
    const filteredParams: any[] = filteredResponse.body.data?.parameters ?? [];
    expect(filteredParams).toHaveLength(1);
    expect(filteredParams[0].systemId).toBe(firstParamSystemId);
  });
});
