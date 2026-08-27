/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {DataSourceProvider} from '../../../src/infrastructure-wrapper/database/providers/data-source-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type HttpServer = Parameters<typeof request>[0];
const STACK_SIZE_PROPERTY_ID = 0x08_00_10_13;

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

async function getModuleWithStackSizeProperty(
  app: INestApplication,
  projectId: string,
): Promise<number> {
  const dataSource = await app.get(DataSourceProvider).getDataSource();
  const rows = await dataSource.query(
    `SELECT sm.system_id AS systemId,
            sm.container_system_id AS containerSystemId,
            cpd_def.system_id AS propertySystemId
       FROM spf_modules sm
       INNER JOIN files f
         ON f.system_id = sm.file_system_id
       INNER JOIN container_property_definitions cpd_def
          ON cpd_def.property_id = ?
         AND cpd_def.file_system_id = sm.file_system_id
      WHERE f.project_system_id = ?
      LIMIT 1`,
    [STACK_SIZE_PROPERTY_ID, projectId],
  );
  if (rows.length === 0)
    throw new Error('Fixture has no module in a stack-size-enabled container');

  const row = rows[0];
  await dataSource.query(
    `INSERT OR IGNORE INTO container_property_data
       (system_id, container_system_id, property_system_id, payload)
     SELECT COALESCE(MAX(system_id), 0) + 1, ?, ?, ?
       FROM container_property_data`,
    [row.containerSystemId, row.propertySystemId, Buffer.alloc(4)],
  );
  return Number(row.systemId);
}

async function getModuleInSurvivingStackSizeContainer(
  app: INestApplication,
  projectId: string,
): Promise<{moduleSystemId: number; containerSystemId: number}> {
  const dataSource = await app.get(DataSourceProvider).getDataSource();
  // The fixture has no domain helper for selecting a shared container.
  const rows = await dataSource.query(
    `SELECT sm.system_id AS moduleSystemId,
            sm.container_system_id AS containerSystemId
       FROM spf_modules sm
       INNER JOIN files f
         ON f.system_id = sm.file_system_id
       INNER JOIN container_property_definitions cpd_def
         ON cpd_def.property_id = ?
        AND cpd_def.file_system_id = sm.file_system_id
      WHERE f.project_system_id = ?
        AND EXISTS (
          SELECT 1
            FROM spf_modules sibling
           WHERE sibling.container_system_id = sm.container_system_id
             AND sibling.system_id <> sm.system_id
        )
      LIMIT 1`,
    [STACK_SIZE_PROPERTY_ID, projectId],
  );
  if (rows.length === 0) {
    throw new Error(
      'Fixture has no stack-size-enabled container with two modules',
    );
  }
  return {
    moduleSystemId: Number(rows[0].moduleSystemId),
    containerSystemId: Number(rows[0].containerSystemId),
  };
}

async function getModuleSubgraphId(
  app: INestApplication,
  moduleSystemId: number,
): Promise<number> {
  const dataSource = await app.get(DataSourceProvider).getDataSource();
  const rows = await dataSource.query(
    'SELECT subgraph_system_id AS subgraphSystemId FROM spf_modules WHERE system_id = ?',
    [moduleSystemId],
  );
  if (rows.length === 0) throw new Error('Module row was not found');
  return Number(rows[0].subgraphSystemId);
}

async function setSubgraphImported(
  app: INestApplication,
  subgraphSystemId: number,
  isImported: boolean,
): Promise<void> {
  const dataSource = await app.get(DataSourceProvider).getDataSource();
  await dataSource.query(
    'UPDATE subgraphs SET is_imported = ? WHERE system_id = ?',
    [isImported ? 1 : 0, subgraphSystemId],
  );
}

describe('E2E: DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let moduleSystemId: number;
  let subgraphSystemId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
    projectId = await uploadProject(httpServer, authToken);
    moduleSystemId = await getModuleWithStackSizeProperty(app, projectId);
    subgraphSystemId = await getModuleSubgraphId(app, moduleSystemId);
  }, 180_000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  beforeEach(async () => {
    await startDesignerSession(httpServer, authToken, projectId);
  }, 30_000);

  afterEach(async () => {
    await endSession(httpServer, authToken, projectId);
  }, 30_000);

  it('returns 400 for a malformed module system ID', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(`/arc-api/v1/projects/${projectId}/spf-modules/not-an-id`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    expect(response.status).toBe(400);
  });

  it('returns 400 for an unsupported link deletion mode', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(
        `/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}?linkDeletionMode=invalid`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    expect(response.status).toBe(400);
  });

  it('returns 403 when no active session exists', async () => {
    await endSession(httpServer, authToken, projectId);

    const response = await request(httpServer as HttpServer)
      .delete(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    expect(response.status).toBe(403);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  it('returns 403 when the active session mode is TUNING', async () => {
    await endSession(httpServer, authToken, projectId);
    await request(httpServer as HttpServer)
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'TUNING'})
      .timeout(30_000)
      .expect(201);

    const response = await request(httpServer as HttpServer)
      .delete(`/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    expect(response.status).toBe(403);
    await endSession(httpServer, authToken, projectId);
    await startDesignerSession(httpServer, authToken, projectId);
  }, 60_000);

  it('returns 404 with an entity issue for a missing module', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(`/arc-api/v1/projects/${projectId}/spf-modules/99999999`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      errorCode: 'RESOURCE_NOT_FOUND',
    });
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ENTITY_NOT_FOUND',
          impactedEntity: {entityType: 'SpfModule', systemId: 99999999},
        }),
      ]),
    );
  });

  it('returns 422 with ARC-MOD-SUBGRAPH-IMPORTED for an imported subgraph', async () => {
    await setSubgraphImported(app, subgraphSystemId, true);
    try {
      const response = await request(httpServer as HttpServer)
        .delete(
          `/arc-api/v1/projects/${projectId}/spf-modules/${moduleSystemId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30_000);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        statusCode: 422,
        errorCode: 'DOMAIN_RULE_VIOLATION',
      });
      expect(response.body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({code: 'ARC-MOD-SUBGRAPH-IMPORTED'}),
        ]),
      );
    } finally {
      await setSubgraphImported(app, subgraphSystemId, false);
    }
  });

  it('returns 200 with a stable deletion summary and hides the internal group ID', async () => {
    const successProjectId = await uploadProject(httpServer, authToken);
    const successModuleSystemId = await getModuleWithStackSizeProperty(
      app,
      successProjectId,
    );
    await startDesignerSession(httpServer, authToken, successProjectId);
    try {
      const response = await request(httpServer as HttpServer)
        .delete(
          `/arc-api/v1/projects/${successProjectId}/spf-modules/${successModuleSystemId}?linkDeletionMode=segmentOnly`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30_000);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        deleted: {
          spfModules: [{systemId: String(successModuleSystemId)}],
          subgraphs: expect.any(Array),
          containers: expect.any(Array),
          dataLinks: expect.any(Array),
          controlLinks: expect.any(Array),
        },
        updated: {usecases: expect.any(Array)},
      });
      expect(response.body.data).not.toHaveProperty('groupId');

      const secondDelete = await request(httpServer as HttpServer)
        .delete(
          `/arc-api/v1/projects/${successProjectId}/spf-modules/${successModuleSystemId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30_000);
      expect(secondDelete.status).toBe(404);
    } finally {
      await endSession(httpServer, authToken, successProjectId);
    }
  }, 180_000);

  it('returns the recalculated stack size when the container survives', async () => {
    const successProjectId = await uploadProject(httpServer, authToken);
    const {moduleSystemId: survivingModuleSystemId, containerSystemId} =
      await getModuleInSurvivingStackSizeContainer(app, successProjectId);
    await startDesignerSession(httpServer, authToken, successProjectId);
    try {
      const response = await request(httpServer as HttpServer)
        .delete(
          `/arc-api/v1/projects/${successProjectId}/spf-modules/${survivingModuleSystemId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(30_000);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        deleted: {containers: []},
        updated: {
          containers: [
            {
              systemId: String(containerSystemId),
              stackSize: expect.any(Number),
            },
          ],
        },
      });
      expect(response.body.data.updated.containers).toHaveLength(1);
    } finally {
      await endSession(httpServer, authToken, successProjectId);
    }
  }, 180_000);
});
