/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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
    .timeout(300000)
    .expect(201);

  return res.body.data.projectId as string;
}

describe('Project CRUD E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    projectId = await uploadProject(httpServer, authToken);
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  // ─── GET /projects ───────────────────────────────────────────────────────────

  describe('GET /arc-api/v1/projects', () => {
    it('should return 200 with an array of projects', async () => {
      const res = await request(httpServer)
        .get('/arc-api/v1/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should return projects with the expected shape', async () => {
      const res = await request(httpServer)
        .get('/arc-api/v1/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      const project = res.body.data.find(
        (p: any) => String(p.projectId) === String(projectId),
      );
      expect(project).toBeDefined();
      expect(project).toHaveProperty('projectId');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('description');
      expect(project).toHaveProperty('projectType');
      expect(project).toHaveProperty('sessionMode');
    });

    it('should return 401 when no token is provided', async () => {
      await request(httpServer)
        .get('/arc-api/v1/projects')
        .timeout(10000)
        .expect(401);
    });
  });

  // ─── GET /projects/:projectId ─────────────────────────────────────────────────

  describe('GET /arc-api/v1/projects/:projectId', () => {
    it('should return 200 with the correct project', async () => {
      const res = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      expect(String(res.body.data.projectId)).toBe(String(projectId));
      expect(res.body.data).toHaveProperty('name');
      expect(res.body.data).toHaveProperty('description');
      expect(res.body.data).toHaveProperty('projectType');
      expect(res.body.data).toHaveProperty('sessionMode');
    });

    it('should return READONLY sessionMode when no session is open', async () => {
      const res = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      expect(res.body.data.sessionMode).toBe('READONLY');
    });

    it('should return 404 for a non-existent projectId', async () => {
      await request(httpServer)
        .get('/arc-api/v1/projects/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(404);
    });

    it('should return 401 when no token is provided', async () => {
      await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}`)
        .timeout(10000)
        .expect(401);
    });
  });

  // ─── PATCH /projects/:projectId ───────────────────────────────────────────────

  describe('PATCH /arc-api/v1/projects/:projectId', () => {
    it('should update the project name and return the updated value', async () => {
      const res = await request(httpServer)
        .patch(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({name: 'Renamed Project'})
        .timeout(10000)
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Project');
      expect(String(res.body.data.projectId)).toBe(String(projectId));
    });

    it('should update the project description and return the updated value', async () => {
      const res = await request(httpServer)
        .patch(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({description: 'Updated description'})
        .timeout(10000)
        .expect(200);

      expect(res.body.data.description).toBe('Updated description');
    });

    it('should reflect the updated name when re-fetched', async () => {
      await request(httpServer)
        .patch(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({name: 'Verified Name'})
        .timeout(10000)
        .expect(200);

      const getRes = await request(httpServer)
        .get(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      expect(getRes.body.data.name).toBe('Verified Name');
    });

    it('should return 400 when neither name nor description is provided', async () => {
      await request(httpServer)
        .patch(`/arc-api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .timeout(10000)
        .expect(400);
    });

    it('should return 404 for a non-existent projectId', async () => {
      await request(httpServer)
        .patch('/arc-api/v1/projects/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({name: 'Ghost'})
        .timeout(10000)
        .expect(404);
    });

    it('should return 401 when no token is provided', async () => {
      await request(httpServer)
        .patch(`/arc-api/v1/projects/${projectId}`)
        .send({name: 'Sneaky'})
        .timeout(10000)
        .expect(401);
    });
  });

  // ─── DELETE /projects/:projectId ──────────────────────────────────────────────

  describe('DELETE /arc-api/v1/projects/:projectId', () => {
    let deleteProjectId: string;

    beforeAll(async () => {
      // Upload a second project dedicated for delete tests so the main projectId
      // remains available for the GET/PATCH tests above
      deleteProjectId = await uploadProject(httpServer, authToken);
    }, 350000);

    it('should return 401 when no token is provided', async () => {
      await request(httpServer)
        .delete(`/arc-api/v1/projects/${deleteProjectId}`)
        .timeout(10000)
        .expect(401);
    });

    it('should return 404 for a non-existent projectId', async () => {
      await request(httpServer)
        .delete('/arc-api/v1/projects/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(404);
    });

    it('should delete the project and return 204', async () => {
      await request(httpServer)
        .delete(`/arc-api/v1/projects/${deleteProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(204);
    });

    it('should return 404 when fetching the deleted project', async () => {
      await request(httpServer)
        .get(`/arc-api/v1/projects/${deleteProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(404);
    });

    it('should not appear in the project list after deletion', async () => {
      const res = await request(httpServer)
        .get('/arc-api/v1/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000)
        .expect(200);

      const found = res.body.data.some(
        (p: any) => String(p.projectId) === String(deleteProjectId),
      );
      expect(found).toBe(false);
    });
  });
});
