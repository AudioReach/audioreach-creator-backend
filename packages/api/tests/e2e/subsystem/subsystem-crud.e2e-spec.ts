/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const subsystemPath = (projectId: string) =>
  `/arc-api/v1/projects/${projectId}/subsystems`;

type HttpServer = Parameters<typeof request>[0];

async function uploadProject(
  httpServer: unknown,
  authToken: string,
): Promise<string> {
  const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
  const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');
  const response = await request(httpServer as HttpServer)
    .post('/arc-api/v1/projects/offline/upload-files')
    .set('Authorization', `Bearer ${authToken}`)
    .attach('acdbFile', acdbPath)
    .attach('workspaceFile', awspPath)
    .timeout(120_000)
    .expect(201);
  return response.body.data.projectId as string;
}

async function startDesignerSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as HttpServer)
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
  await request(httpServer as HttpServer)
    .post(`/arc-api/v1/projects/${projectId}/end-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);
}

async function createSubsystem(
  httpServer: unknown,
  authToken: string,
  projectId: string,
  name: string,
): Promise<{systemId: string; naturalId: number; name: string}> {
  const response = await request(httpServer as HttpServer)
    .post(subsystemPath(projectId))
    .set('Authorization', `Bearer ${authToken}`)
    .send({name})
    .timeout(30_000)
    .expect(201);
  return response.body.data;
}

describe('Subsystem API E2E', () => {
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
  }, 180_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  describe('POST /subsystems', () => {
    it('returns 401 without an access token', async () => {
      await request(httpServer as HttpServer)
        .post(subsystemPath(projectId))
        .send({name: 'unauthorized-subsystem'})
        .timeout(30_000)
        .expect(401);
    });

    it('returns 403 without an active project session', async () => {
      await endSession(httpServer, authToken, projectId);

      await request(httpServer as HttpServer)
        .post(subsystemPath(projectId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({name: 'no-session-subsystem'})
        .timeout(30_000)
        .expect(403);

      await startDesignerSession(httpServer, authToken, projectId);
    }, 60_000);

    it('creates a subsystem and maps the snapshot response', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `api-subsystem-${Date.now()}`,
      );

      expect(subsystem.systemId).toMatch(/^\d+$/);
      expect(subsystem.naturalId).toEqual(expect.any(Number));
      expect(subsystem.name).toMatch(/^api-subsystem-/);
    });

    it('returns 422 for a duplicate subsystem name', async () => {
      const name = `duplicate-subsystem-${Date.now()}`;
      await createSubsystem(httpServer, authToken, projectId, name);

      const response = await request(httpServer as HttpServer)
        .post(subsystemPath(projectId))
        .set('Authorization', `Bearer ${authToken}`)
        .send({name})
        .timeout(30_000);

      expect(response.status).toBe(422);
      expect(Array.isArray(response.body.issues)).toBe(true);
    });
  });

  describe('PATCH /subsystems/:subsystemSystemId', () => {
    it('returns 400 when no patch fields are provided', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `patch-subsystem-${Date.now()}`,
      );

      await request(httpServer as HttpServer)
        .patch(`${subsystemPath(projectId)}/${subsystem.systemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .timeout(30_000)
        .expect(400);
    });

    it('updates the subsystem name and returns the mapped subsystem', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `rename-subsystem-${Date.now()}`,
      );
      const name = `renamed-subsystem-${Date.now()}`;

      const response = await request(httpServer as HttpServer)
        .patch(`${subsystemPath(projectId)}/${subsystem.systemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({name})
        .timeout(30_000)
        .expect(200);

      expect(response.body.data.systemId).toBe(subsystem.systemId);
      expect(response.body.data.name).toBe(name);
      expect(Array.isArray(response.body.data.dataPorts)).toBe(true);
      expect(Array.isArray(response.body.data.controlPorts)).toBe(true);
    });

    it('returns 400 for an invalid subsystem system ID', async () => {
      await request(httpServer as HttpServer)
        .patch(`${subsystemPath(projectId)}/not-a-system-id`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({name: 'invalid-id'})
        .timeout(30_000)
        .expect(400);
    });
  });

  describe('PUT /subsystems/:subsystemSystemId/filtered-keys', () => {
    it('replaces filtered keys with an empty list', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `filtered-keys-subsystem-${Date.now()}`,
      );

      const response = await request(httpServer as HttpServer)
        .put(`${subsystemPath(projectId)}/${subsystem.systemId}/filtered-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({keySystemIds: []})
        .timeout(30_000)
        .expect(200);

      expect(response.body.data.systemId).toBe(subsystem.systemId);
      expect(response.body.data.filteredKeys).toEqual([]);
    });

    it('returns 400 when keySystemIds is not an array of strings', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `invalid-filtered-keys-${Date.now()}`,
      );

      await request(httpServer as HttpServer)
        .put(`${subsystemPath(projectId)}/${subsystem.systemId}/filtered-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({keySystemIds: [1]})
        .timeout(30_000)
        .expect(400);
    });
  });

  describe('POST /subsystems/components/move', () => {
    it('returns 400 when no components are provided', async () => {
      await request(httpServer as HttpServer)
        .post(`${subsystemPath(projectId)}/components/move`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({targetSubsystemSystemId: null})
        .timeout(30_000)
        .expect(400);
    });

    it('moves a subsystem into another subsystem', async () => {
      const source = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `move-source-${Date.now()}`,
      );
      const target = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `move-target-${Date.now()}`,
      );

      const response = await request(httpServer as HttpServer)
        .post(`${subsystemPath(projectId)}/components/move`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subsystemSystemIds: [source.systemId],
          targetSubsystemSystemId: target.systemId,
        })
        .timeout(30_000)
        .expect(201);

      expect(response.body.data.updatedSubsystems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            systemId: source.systemId,
            parentSystemId: target.systemId,
          }),
        ]),
      );
      expect(response.body.data.addedDataLinks).toEqual([]);
      expect(response.body.data.removedDataLinks).toEqual([]);
      expect(response.body.data.addedControlLinks).toEqual([]);
      expect(response.body.data.removedControlLinks).toEqual([]);
    }, 60_000);
  });

  describe('DELETE /subsystems/:subsystemSystemId', () => {
    it('deletes an empty subsystem and returns its snapshot', async () => {
      const subsystem = await createSubsystem(
        httpServer,
        authToken,
        projectId,
        `delete-subsystem-${Date.now()}`,
      );

      const response = await request(httpServer as HttpServer)
        .delete(`${subsystemPath(projectId)}/${subsystem.systemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30_000)
        .expect(200);

      expect(response.body.data).toMatchObject({
        systemId: subsystem.systemId,
        naturalId: subsystem.naturalId,
        name: subsystem.name,
      });
    });
  });
});
