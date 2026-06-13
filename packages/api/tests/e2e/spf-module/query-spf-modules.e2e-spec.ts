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

describe('SPF Module Query E2E (POST /arc-api/v1/projects/{projectId}/spf-modules/query)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let moduleSystemIds: string[];

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;

    // Upload fixture files to get a project with real module data
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000)
      .expect(201);

    projectId = uploadResponse.body.data.projectId;

    // Discover module systemIds via usecase components query
    // First get all usecases to find one with modules
    const usecasesResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases/`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    const usecases = usecasesResponse.body.data ?? [];
    const usecaseSystemIds: string[] = [];

    for (const uc of usecases) {
      // Each entry may have an inner usecases[] array or be a direct usecase
      const inner: any[] = uc.usecases ?? [];
      for (const u of inner) {
        if (u.systemId) usecaseSystemIds.push(String(u.systemId));
      }
      if (!inner.length && uc.systemId) {
        usecaseSystemIds.push(String(uc.systemId));
      }
    }

    if (!usecaseSystemIds.length) {
      moduleSystemIds = [];
      return;
    }

    // Fetch components for the first usecase to extract module systemIds
    const componentsResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [usecaseSystemIds[0]]})
      .timeout(30000)
      .expect(200);

    const spfModules: any[] = componentsResponse.body.data?.spfModules ?? [];
    moduleSystemIds = spfModules
      .map((m: any) => String(m.systemId))
      .filter(Boolean)
      .slice(0, 5); // limit to first 5 to keep test fast
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return HTTP 400 when systemIds is empty', async () => {
    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: []})
      .timeout(30000)
      .expect(400);

    expect(response.body).toBeDefined();
  });

  it('should return HTTP 200 with empty array for unknown systemIds', async () => {
    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: ['999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('should return SPF modules with correct shape for known systemIds', async () => {
    if (!moduleSystemIds.length) {
      console.warn('No module systemIds found — skipping assertion');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: moduleSystemIds})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('SPF modules retrieved successfully');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);

    // Verify shape of each returned module
    for (const module of response.body.data) {
      // Identity fields
      expect(typeof module.systemId).toBe('string');
      expect(typeof module.alias).toBe('string');
      expect(typeof module.name).toBe('string');
      expect(typeof module.moduleId).toBe('number');
      expect(typeof module.subgraphId).toBe('number');
      expect(typeof module.containerId).toBe('number');

      // Definition capabilities
      expect(typeof module.maxInputPortsSupported).toBe('number');
      expect(typeof module.maxOutputPortsSupported).toBe('number');
      expect(typeof module.maxControlPortsSupported).toBe('number');

      // heapId removed — must not be present
      expect(module.heapId).toBeUndefined();

      // Ports
      expect(Array.isArray(module.dataPorts)).toBe(true);
      expect(Array.isArray(module.controlPorts)).toBe(true);

      // changeInfo
      expect(module.changeInfo).toBeDefined();
      expect(module.changeInfo.changeType).toBeDefined();

      // Data port shape
      for (const port of module.dataPorts) {
        expect(typeof port.systemId).toBe('string');
        expect(typeof port.portIoType).toBe('string');
        expect(['Input', 'Output']).toContain(port.portIoType);
        expect(typeof port.portType).toBe('string');
        expect(['Static', 'Dynamic']).toContain(port.portType);
        expect(typeof port.totalLinksAtPort).toBe('number');
      }

      // Control port shape
      for (const port of module.controlPorts) {
        expect(typeof port.systemId).toBe('string');
        expect(Array.isArray(port.intents)).toBe(true);
      }
    }
  });

  it('should not include tuningConfig when includeTuningConfig is not set', async () => {
    if (!moduleSystemIds.length) return;

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [moduleSystemIds[0]]})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    // tuningConfig should be absent when flag not passed
    for (const module of response.body.data) {
      expect(module.tuningConfig).toBeUndefined();
    }
  });

  it('should return partial result when mix of valid and invalid systemIds', async () => {
    if (!moduleSystemIds.length) return;

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [moduleSystemIds[0], '999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    // Only valid module should be returned — unknown ID silently omitted
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].systemId).toBe(moduleSystemIds[0]);
  });
}, 400000);
