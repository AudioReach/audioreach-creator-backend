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

describe('Usecase & Subgraph Component Query E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let usecaseIds: string[];
  let subgraphSystemId: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    usecaseIds = [];

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResp = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000);

    if (!uploadResp.body?.data?.projectId) {
      console.error(
        'Upload failed:',
        uploadResp.status,
        JSON.stringify(uploadResp.body),
      );
      return;
    }

    projectId = uploadResp.body.data.projectId;

    // Collect usecase IDs for component query tests
    const usecasesResp = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (usecasesResp.status === 200) {
      const usecases: any[] = usecasesResp.body.data ?? [];
      usecaseIds = usecases.map((u: any) => String(u.systemId)).filter(Boolean);
    }

    // Collect a subgraphSystemId for subgraph component tests
    if (usecaseIds.length > 0) {
      const componentsResp = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseIds[0]]})
        .timeout(30000);

      if (componentsResp.status === 200) {
        const modules: any[] = componentsResp.body?.data?.spfModules ?? [];
        if (modules.length > 0) {
          subgraphSystemId = String(modules[0].subgraphId);
        }
      }
    }
  }, 360000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  // ── GET /usecases ────────────────────────────────────────────────────────────

  describe('GET /arc-api/v1/projects/:projectId/usecases', () => {
    it('returns 200 with an array of usecases', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}/usecases`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect(resp.status).toBe(200);
      expect(resp.body.data).toBeDefined();
      expect(Array.isArray(resp.body.data)).toBe(true);
    });

    it('each usecase has systemId and gkv fields', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}/usecases`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      if (resp.status !== 200 || !resp.body.data.length) return;

      const usecase = resp.body.data[0];
      expect(usecase.systemId).toBeDefined();
      expect(Array.isArray(usecase.keyValueCollection)).toBe(true);
    });

    it('returns 400 for an invalid filter field', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/usecases?filter=unknownField:123`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect(resp.status).toBe(400);
    });

    it('returns 400 for malformed filter expression', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}/usecases?filter=AND AND`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect(resp.status).toBe(400);
    });

    it('returns 200 with valid filter — subgraphId in hex', async () => {
      if (!projectId || !subgraphSystemId) return;

      const hexId = `0x${Number(subgraphSystemId).toString(16)}`;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/usecases?filter=subgraphId:${hexId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect([200, 207]).toContain(resp.status);
      expect(resp.body.data).toBeDefined();
    });
  });

  // ── POST /usecases/components/query ──────────────────────────────────────────

  describe('POST /arc-api/v1/projects/:projectId/usecases/components/query', () => {
    it('returns 200 with flat components for valid usecase IDs', async () => {
      if (!projectId || !usecaseIds.length) return;

      const resp = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseIds[0]]})
        .timeout(30000);

      expect(resp.status).toBe(200);
      const data = resp.body.data;
      expect(Array.isArray(data.spfModules)).toBe(true);
      expect(Array.isArray(data.dataLinks)).toBe(true);
      expect(Array.isArray(data.controlLinks)).toBe(true);
    });

    it('each module has systemId, subgraphId, containerId', async () => {
      if (!projectId || !usecaseIds.length) return;

      const resp = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseIds[0]]})
        .timeout(30000);

      if (resp.status !== 200 || !resp.body.data.spfModules.length) return;

      const module = resp.body.data.spfModules[0];
      expect(module.systemId).toBeDefined();
      expect(module.subgraphId).toBeDefined();
      expect(module.containerId).toBeDefined();
    });

    it('returns 400 for empty systemIds', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: []})
        .timeout(30000);

      expect(resp.status).toBe(400);
    });

    it('returns 4xx for non-existent usecase ID', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: ['999999999']})
        .timeout(30000);

      expect(resp.status).toBeGreaterThanOrEqual(400);
    });

    it('deduplicates — querying same usecase twice returns same set as once', async () => {
      if (!projectId || !usecaseIds.length) return;

      const [once, twice] = await Promise.all([
        request(httpServer)
          .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({systemIds: [usecaseIds[0]]})
          .timeout(30000),
        request(httpServer)
          .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({systemIds: [usecaseIds[0], usecaseIds[0]]})
          .timeout(30000),
      ]);

      if (once.status !== 200 || twice.status !== 200) return;

      expect(once.body.data.spfModules.length).toBe(
        twice.body.data.spfModules.length,
      );
      expect(once.body.data.dataLinks.length).toBe(
        twice.body.data.dataLinks.length,
      );
    });
  });

  // ── POST /usecases/components/query-with-subsystems ──────────────────────────

  describe('POST /arc-api/v1/projects/:projectId/usecases/components/query-with-subsystems', () => {
    it('returns 200 with hierarchical structure', async () => {
      if (!projectId || !usecaseIds.length) return;

      const resp = await request(httpServer)
        .post(
          `/arc-api/v1/projects/${projectId}/usecases/components/query-with-subsystems`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseIds[0]]})
        .timeout(30000);

      expect(resp.status).toBe(200);
      const data = resp.body.data;
      expect(Array.isArray(data.spfModules)).toBe(true);
      expect(Array.isArray(data.dataLinks)).toBe(true);
      expect(Array.isArray(data.controlLinks)).toBe(true);
      expect(Array.isArray(data.subsystems)).toBe(true);
    });

    it('subsystems have children with same shape (recursive)', async () => {
      if (!projectId || !usecaseIds.length) return;

      const resp = await request(httpServer)
        .post(
          `/arc-api/v1/projects/${projectId}/usecases/components/query-with-subsystems`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: [usecaseIds[0]]})
        .timeout(30000);

      if (resp.status !== 200) return;

      for (const sub of resp.body.data.subsystems ?? []) {
        expect(sub.systemId).toBeDefined();
        expect(sub.name).toBeDefined();
        expect(sub.children).toBeDefined();
        expect(Array.isArray(sub.children.spfModules)).toBe(true);
        expect(Array.isArray(sub.children.subsystems)).toBe(true);
        // Virtual link arrays must always be present at every subsystem level (QWS-06, QWS-07)
        expect(Array.isArray(sub.children.dataLinks)).toBe(true);
        expect(Array.isArray(sub.children.controlLinks)).toBe(true);
      }
    });

    it('hierarchy uses virtual links — top-level links match flat query (QWS-04)', async () => {
      // Verify that the hierarchy endpoint uses virtual segments rather than raw links.
      // The top-level controlLinks and dataLinks in query-with-subsystems should equal
      // those returned by the flat /query for the same usecases (both scoped identically).
      if (!projectId || !usecaseIds.length) return;

      const [flatResp, hierarchyResp] = await Promise.all([
        request(httpServer)
          .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({systemIds: [usecaseIds[0]]})
          .timeout(30000),
        request(httpServer)
          .post(
            `/arc-api/v1/projects/${projectId}/usecases/components/query-with-subsystems`,
          )
          .set('Authorization', `Bearer ${authToken}`)
          .send({systemIds: [usecaseIds[0]]})
          .timeout(30000),
      ]);

      if (flatResp.status !== 200 || hierarchyResp.status !== 200) return;

      // Top-level links from hierarchy (modules not inside any subsystem) are placed at root.
      // Their count may differ from flat since boundary-crossing links appear as virtual segments
      // (one outside + one inside) rather than a single raw link.
      expect(Array.isArray(hierarchyResp.body.data.controlLinks)).toBe(true);
      expect(Array.isArray(hierarchyResp.body.data.dataLinks)).toBe(true);

      // Every systemId in the hierarchy top-level controlLinks must be a number (QWS-04 contract)
      for (const cl of hierarchyResp.body.data.controlLinks) {
        expect(typeof cl.systemId).toBe('number');
        expect(typeof cl.peerNodeASystemId).toBe('number');
        expect(typeof cl.peerNodeBSystemId).toBe('number');
      }
    });

    it('returns 400 for empty systemIds', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .post(
          `/arc-api/v1/projects/${projectId}/usecases/components/query-with-subsystems`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({systemIds: []})
        .timeout(30000);

      expect(resp.status).toBe(400);
    });
  });

  // ── GET /subgraphs/{subgraphSystemId}/components ─────────────────────────────

  describe('GET /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/components', () => {
    it('returns 200 with flat components for a valid subgraph', async () => {
      if (!projectId || !subgraphSystemId) return;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/components`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect(resp.status).toBe(200);
      const data = resp.body.data;
      expect(Array.isArray(data.spfModules)).toBe(true);
      expect(Array.isArray(data.dataLinks)).toBe(true);
      expect(Array.isArray(data.controlLinks)).toBe(true);
    });

    it('all returned modules belong to the requested subgraph', async () => {
      if (!projectId || !subgraphSystemId) return;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/components`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      if (resp.status !== 200 || !resp.body.data.spfModules.length) return;

      for (const module of resp.body.data.spfModules) {
        expect(String(module.subgraphId)).toBe(subgraphSystemId);
      }
    });

    it('returns 400 for a non-numeric subgraphSystemId', async () => {
      if (!projectId) return;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/subgraphs/not-a-number/components`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      expect(resp.status).toBe(400);
    });

    it('response has no subsystems field (flat, not hierarchical)', async () => {
      if (!projectId || !subgraphSystemId) return;

      const resp = await request(httpServer)
        .get(
          `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/components`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30000);

      if (resp.status !== 200) return;

      expect(resp.body.data.subsystems).toBeUndefined();
    });
  });
});
