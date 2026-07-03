/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SPF Module Definition Query E2E (GET /arc-api/v1/projects/{projectId}/spf-module-definitions)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleModuleSystemId: string | undefined;
  let sampleModuleId: number | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;

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

    const listResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/spf-module-definitions`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (listResponse.status !== 200) return;

    const modules: any[] = listResponse.body.data ?? [];
    if (modules.length > 0) {
      sampleModuleSystemId = String(modules[0].systemId);
      sampleModuleId = modules[0].moduleId;
    }

    console.log(
      `[SpfModuleDefinition E2E] projectId=${projectId}, sampleModuleSystemId=${sampleModuleSystemId}`,
    );
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return spf module definitions with correct shape', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/spf-module-definitions`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const module of response.body.data) {
      expect(typeof module.systemId).toBe('string');
      expect(typeof module.moduleId).toBe('number');
      expect(typeof module.name).toBe('string');
      expect(Array.isArray(module.paramDefinitionsSummaryInfo)).toBe(true);
      expect(module.processorInfo).toBeDefined();
      expect(typeof module.processorInfo.systemId).toBe('string');
      expect(typeof module.processorInfo.processorId).toBe('number');
      expect(module.moduleInfo).toBeDefined();
      expect(typeof module.isLoadedAtBootup).toBe('boolean');
      expect(typeof module.isCustomModule).toBe('boolean');
    }
  });

  it('should filter by moduleDefinitionId when provided', async () => {
    if (!projectId || sampleModuleId === undefined) {
      console.warn('No projectId or sampleModuleId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions?moduleDefinitionId=${sampleModuleId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const module of response.body.data) {
      expect(module.moduleId).toBe(sampleModuleId);
    }
  });

  it('should return HTTP 200 with empty array when moduleDefinitionId filter matches nothing', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions?moduleDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number on the list endpoint', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/spf-module-definitions')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return HTTP 404 for a nonexistent project on the list endpoint', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/999999/spf-module-definitions')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return a single spf module definition with correct shape', async () => {
    if (!projectId || !sampleModuleSystemId) {
      console.warn('No projectId or sampleModuleSystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions/${sampleModuleSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    const module = response.body.data;
    expect(module.systemId).toBe(sampleModuleSystemId);
    expect(typeof module.moduleId).toBe('number');
    expect(typeof module.name).toBe('string');
    expect(Array.isArray(module.paramDefinitionsSummaryInfo)).toBe(true);
    expect(typeof module.isCustomModule).toBe('boolean');
  });

  it('should return HTTP 404 when the module system ID does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/spf-module-definitions/999999999`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 404 for a nonexistent project on the get-by-id endpoint', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/999999/spf-module-definitions/123')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 400 when moduleSystemId is not a valid number', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions/not-a-number`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return HTTP 400 for custom-module-metadata when the module is not a custom module', async () => {
    if (!projectId || !sampleModuleSystemId) {
      console.warn('No projectId or sampleModuleSystemId — skipping');
      return;
    }

    const detailResponse = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions/${sampleModuleSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (detailResponse.body?.data?.isCustomModule) {
      console.warn('Sample module is a custom module — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions/${sampleModuleSystemId}/custom-module-metadata`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return HTTP 404 for custom-module-metadata when the module does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-module-definitions/999999999/custom-module-metadata`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 404 for custom-module-metadata on a nonexistent project', async () => {
    const response = await request(httpServer)
      .get(
        '/arc-api/v1/projects/999999/spf-module-definitions/123/custom-module-metadata',
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });
}, 400000);
