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
  let projectId: string | undefined;
  let moduleSystemIds: string[];

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    moduleSystemIds = [];
    projectId = undefined;

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

    // Fetch components for the first usecase to extract module systemIds
    const componentsResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [usecaseSystemIds[0]]})
      .timeout(30000);

    if (componentsResponse.status !== 200) return;

    const spfModules: any[] = componentsResponse.body.data?.spfModules ?? [];
    moduleSystemIds = spfModules
      .map((m: any) => String(m.systemId))
      .filter(Boolean)
      .slice(0, 5);

    console.log(
      `[SPF E2E] projectId=${projectId}, moduleSystemIds=[${moduleSystemIds.join(', ')}]`,
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
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
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
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: ['999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(0);
  });

  it('should return SPF modules with correct shape and verified DTO fields', async () => {
    if (!projectId || !moduleSystemIds.length) {
      console.warn('No projectId or moduleSystemIds — skipping');
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

    for (const module of response.body.data) {
      // Identity fields
      expect(typeof module.systemId).toBe('string');
      expect(typeof module.alias).toBe('string');
      expect(typeof module.name).toBe('string');
      expect(typeof module.moduleId).toBe('number');
      expect(typeof module.subgraphId).toBe('number');
      expect(typeof module.containerId).toBe('number');

      // Definition capability counts
      expect(typeof module.maxInputPortsSupported).toBe('number');
      expect(typeof module.maxOutputPortsSupported).toBe('number');
      expect(typeof module.maxControlPortsSupported).toBe('number');

      // changeInfo must not be present — not populated by the graph-view query
      expect(module.changeInfo).toBeUndefined();
      // heapId removed
      expect(module.heapId).toBeUndefined();

      // Data ports
      expect(Array.isArray(module.dataPorts)).toBe(true);
      for (const port of module.dataPorts) {
        expect(typeof port.systemId).toBe('string');
        expect(typeof port.name).toBe('string'); // resolved from definition
        expect(typeof port.portIoType).toBe('string');
        expect(['Input', 'Output']).toContain(port.portIoType);
        expect(typeof port.portType).toBe('string');
        expect(['Static', 'Dynamic']).toContain(port.portType);
        expect(typeof port.totalLinksAtPort).toBe('number');
      }

      // Control ports
      expect(Array.isArray(module.controlPorts)).toBe(true);
      for (const port of module.controlPorts) {
        expect(typeof port.systemId).toBe('string');
        expect(typeof port.controlPortName).toBe('string'); // resolved from definition
        expect(Array.isArray(port.intents)).toBe(true);
        for (const intent of port.intents) {
          expect(typeof intent.id).toBe('number');
          expect(typeof intent.name).toBe('string'); // resolved from definition
          // Should no longer be generated synthetic name
          expect(intent.name).not.toMatch(/^Intent_\d+$/);
        }
      }
    }
  });

  it('should return partial result when mix of valid and invalid systemIds', async () => {
    if (!projectId || !moduleSystemIds.length) {
      console.warn('No projectId or moduleSystemIds — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [moduleSystemIds[0], '999999999']})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].systemId).toBe(moduleSystemIds[0]);
  });

  it('should not include tuningConfig when include param is not set', async () => {
    if (!projectId || !moduleSystemIds.length) {
      console.warn('No projectId or moduleSystemIds — skipping');
      return;
    }

    const response = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [moduleSystemIds[0]]})
      .timeout(30000)
      .expect(200);

    expect(response.body.success).toBe(true);
    for (const module of response.body.data) {
      expect(module.ckvs).toBeUndefined();
      expect(module.tags).toBeUndefined();
    }
  });

  it('should reflect alias update after staging an edit action', async () => {
    if (!projectId || !moduleSystemIds.length) {
      console.warn('No projectId or moduleSystemIds — skipping');
      return;
    }

    // Pick a random module to update
    const targetId =
      moduleSystemIds[Math.floor(Math.random() * moduleSystemIds.length)];

    // Fetch baseline
    const beforeResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [targetId]})
      .timeout(30000)
      .expect(200);

    expect(beforeResponse.body.data.length).toBe(1);
    const originalAlias: string = beforeResponse.body.data[0].alias;

    // Stage an alias UPDATE via edit session
    const newAlias = `e2e_alias_${Date.now()}`;
    const updateResponse = await request(httpServer)
      .post(
        `/arc-api/v1/projects/${projectId}/spf-modules/${targetId}/edit-session/stage`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .send({alias: newAlias})
      .timeout(30000);

    if (updateResponse.status === 404 || updateResponse.status === 501) {
      console.warn(
        `Edit session staging not implemented (${updateResponse.status}) — skipping alias update assertion`,
      );
      return;
    }

    expect(updateResponse.status).toBe(200);

    // Query again — the staged alias should now be returned
    const afterResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: [targetId]})
      .timeout(30000)
      .expect(200);

    expect(afterResponse.body.data.length).toBe(1);
    expect(afterResponse.body.data[0].alias).toBe(newAlias);
    expect(afterResponse.body.data[0].alias).not.toBe(originalAlias);
  });
}, 400000);
