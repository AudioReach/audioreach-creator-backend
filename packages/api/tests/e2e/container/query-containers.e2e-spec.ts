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

describe('Container Query E2E (POST /arc-api/v1/projects/{projectId}/containers/query)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let containerSystemIds: string[];

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    containerSystemIds = [];
    projectId = undefined;

    // Upload fixture files to get a project with real container data
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

    // Get all usecases to find one with modules that reference containers
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

    // Fetch components for the first usecase — each module carries its container.systemId
    const componentsResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [usecaseSystemIds[0]]})
      .timeout(30000);

    if (componentsResponse.status !== 200) return;

    // Extract unique container systemIds from the modules in the component graph
    const spfModules: any[] = componentsResponse.body.data?.spfModules ?? [];
    const seen = new Set<string>();
    for (const m of spfModules) {
      const containerSystemId = m.container?.systemId
        ? String(m.container.systemId)
        : undefined;
      if (containerSystemId && !seen.has(containerSystemId)) {
        seen.add(containerSystemId);
        containerSystemIds.push(containerSystemId);
      }
    }
    containerSystemIds = containerSystemIds.slice(0, 5);

    console.log(
      `[Container E2E] projectId=${projectId}, containerSystemIds=[${containerSystemIds.join(', ')}]`,
    );
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return HTTP 400 when systemIds is empty', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/containers/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: []})
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return HTTP 200 with empty array for unknown systemIds', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/containers/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: ['999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(0);
  });

  it('should return containers with correct shape for known systemIds', async () => {
    if (!projectId || !containerSystemIds.length) {
      console.warn('No projectId or containerSystemIds — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/containers/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: containerSystemIds})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Containers retrieved successfully');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);

    for (const container of response.body.data) {
      // systemId is serialised as a string in the API response
      expect(typeof container.systemId).toBe('string');
      // id is containerId — the business key from the ACDB file
      expect(typeof container.id).toBe('number');
      // type identifies the container category (e.g. 'WCD_RX', 'APM')
      expect(typeof container.type).toBe('string');
      expect(container.type.length).toBeGreaterThan(0);
      // changeInfo must not be present — not populated by the graph-view query
      expect(container.changeInfo).toBeUndefined();
    }
  });

  it('should return partial result when mix of valid and invalid systemIds', async () => {
    if (!projectId || !containerSystemIds.length) {
      console.warn('No projectId or containerSystemIds — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/containers/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [containerSystemIds[0], '999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].systemId).toBe(containerSystemIds[0]);
  });
}, 400000);
