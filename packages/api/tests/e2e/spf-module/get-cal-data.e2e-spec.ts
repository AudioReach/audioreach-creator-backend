/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {createTestApp} from '../helpers/test-app.factory.js';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IIR_MBDRC_MODULE_ID = 0x07001017;

describe('GET /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/cal-data/:ckvSystemId', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    // Sign with the same secret and required fields used by the real JwtStrategy
    authToken = jwt.sign(
      {sub: 'test-user-id', clientId: 'test-client', username: 'test-user'},
      'arc-web-api',
    );
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for non-numeric spfModuleSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/not-a-number/cal-data/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric ckvSystemId', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/1/spf-modules/1/cal-data/not-a-number')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid param-system-ids', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/arc-api/v1/projects/1/spf-modules/1/cal-data/1?param-system-ids=abc,2',
      )
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('accepts hex-format IDs (0x prefix) without 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/arc-api/v1/projects/0x1/spf-modules/0x1/cal-data/0x1')
      .set('Authorization', `Bearer ${authToken}`);
    expect([200, 404, 422]).toContain(res.status);
  });
});

describe('GET cal-data for IIR_MBDRC module (moduleId=0x07001017)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let iirMbdrcSystemId: string | undefined;
  let iirMbdrcCkvSystemIds: string[];

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    iirMbdrcSystemId = undefined;
    iirMbdrcCkvSystemIds = [];

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

    // For each usecase, query its components to find IIR_MBDRC module instances
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

      // Query full SpfModuleDto (includes moduleId and ckvs) to find IIR_MBDRC
      const queryResponse = await request(httpServer)
        .post(
          `/arc-api/v1/projects/${projectId}/spf-modules/query?include=ckvs`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: moduleSystemIds})
        .timeout(30000);

      if (queryResponse.status < 200 || queryResponse.status >= 300) continue;

      const moduleDtos: any[] = queryResponse.body.data ?? [];
      for (const moduleDto of moduleDtos) {
        if (moduleDto.moduleId === IIR_MBDRC_MODULE_ID) {
          iirMbdrcSystemId = String(moduleDto.systemId);
          iirMbdrcCkvSystemIds = (moduleDto.ckvs ?? []).map((ckv: any) =>
            String(ckv.systemId),
          );
          console.log(
            `[Cal-Data E2E] Found IIR_MBDRC: systemId=${iirMbdrcSystemId}, ckvs=[${iirMbdrcCkvSystemIds.join(', ')}]`,
          );
          break outer;
        }
      }
    }

    if (!iirMbdrcSystemId) {
      console.warn(
        '[Cal-Data E2E] IIR_MBDRC module (id=0x07001017) not found in fixture',
      );
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns HTTP 200 for IIR_MBDRC cal-data with first CKV', async () => {
    if (!projectId || !iirMbdrcSystemId) {
      throw new Error(
        'IIR_MBDRC module (moduleId=0x07001017) not found in fixture',
      );
    }

    const ckvSystemId = iirMbdrcCkvSystemIds[0];
    if (!ckvSystemId) {
      throw new Error('IIR_MBDRC module has no CKVs');
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-modules/${iirMbdrcSystemId}/cal-data/${ckvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toBeDefined();
    process.stdout.write(JSON.stringify(response.body, null, 2) + '\n');
  });
});
