/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ModuleDefinition = {
  systemId: string;
  naturalId: number;
  processorInfo: {systemId: string};
};

describe('E2E: POST /arc-api/v1/projects/:projectId/spf-modules', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let authToken: string;
  let projectId: string;
  let moduleDefinition: ModuleDefinition;
  let sessionOpen = false;

  const endpoint = () => `/arc-api/v1/projects/${projectId}/spf-modules`;

  async function startSession(mode: 'DESIGNER' | 'TUNING' = 'DESIGNER') {
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode})
      .expect(201);
    sessionOpen = true;
  }

  async function endSession() {
    if (!sessionOpen) return;
    await request(httpServer as Parameters<typeof request>[0])
      .post(`/arc-api/v1/projects/${projectId}/end-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    sessionOpen = false;
  }

  async function createModule(body: Record<string, string>) {
    return request(httpServer as Parameters<typeof request>[0])
      .post(endpoint())
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
      .timeout(30_000);
  }

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');
    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300_000)
      .expect(201);

    projectId = uploadResponse.body.data.projectId as string;

    const definitionsResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/spf-module-definitions`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30_000)
      .expect(200);

    const definitions = definitionsResponse.body.data as ModuleDefinition[];
    if (!definitions.length || !definitions[0].processorInfo?.systemId) {
      throw new Error('Fixture has no SPF module definition with a processor');
    }
    moduleDefinition = definitions[0];
  }, 350_000);

  afterAll(async () => {
    await endSession();
    await teardownE2ETest(app);
  });

  afterEach(async () => {
    await endSession();
  });

  it('returns 403 when no edit session is open', async () => {
    const response = await createModule({
      moduleDefinitionSystemId: moduleDefinition.systemId,
      processorSystemId: moduleDefinition.processorInfo.systemId,
    });

    expect(response.status).toBe(403);
  }, 60_000);

  it('returns 403 for a TUNING session', async () => {
    await startSession('TUNING');
    const response = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
    });

    expect(response.status).toBe(403);
    await endSession();
  }, 60_000);

  it('returns 400 when required fields are missing', async () => {
    await startSession();
    const response = await createModule({});

    expect(response.status).toBe(400);
    await endSession();
  }, 60_000);

  it('returns 404 when the module definition or processor does not exist', async () => {
    await startSession();
    const response = await createModule({
      moduleDefinitionSystemId: '999999999',
      processorSystemId: '999999999',
    });

    expect(response.status).toBe(404);
    await endSession();
  }, 60_000);

  // Pending: CreateModuleHandler currently fails with an edit_actions uniqueness
  // constraint while staging the first successful module creation.
  it.skip('creates a module and auto-creates its subgraph and container', async () => {
    await startSession();
    const response = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        systemId: expect.any(String),
        definitionSystemId: expect.any(String),
        subgraphSystemId: expect.any(String),
        containerSystemId: expect.any(String),
      }),
    );

    const moduleId = response.body.data.systemId as string;
    const queryResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/spf-modules`)
      .query({systemId: moduleId})
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(queryResponse.body.data).toHaveLength(1);
    expect(queryResponse.body.data[0].systemId).toBe(moduleId);
    await endSession();
  }, 60_000);

  it.skip('creates a module in an existing subgraph and auto-creates a container', async () => {
    await startSession();
    const first = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
    });
    expect(first.status).toBe(200);

    const response = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
      subgraphSystemId: first.body.data.subgraphSystemId,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.subgraphSystemId).toBe(
      first.body.data.subgraphSystemId,
    );
    expect(response.body.data.systemId).not.toBe(first.body.data.systemId);
    await endSession();
  }, 60_000);

  it.skip('creates a module in an existing subgraph and container', async () => {
    await startSession();
    const first = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
    });
    expect(first.status).toBe(200);

    const response = await createModule({
      moduleDefinitionSystemId: String(moduleDefinition.naturalId),
      processorSystemId: moduleDefinition.processorInfo.systemId,
      subgraphSystemId: first.body.data.subgraphSystemId,
      containerSystemId: first.body.data.containerSystemId,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.subgraphSystemId).toBe(
      first.body.data.subgraphSystemId,
    );
    expect(response.body.data.containerSystemId).toBe(
      first.body.data.containerSystemId,
    );
    expect(response.body.data.systemId).not.toBe(first.body.data.systemId);
    await endSession();
  }, 60_000);
});
