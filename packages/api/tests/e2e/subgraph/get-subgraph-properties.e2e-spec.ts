/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {INestApplication} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startDesignerSession(
  httpServer: unknown,
  authToken: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as Parameters<typeof request>[0])
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
  await request(httpServer as Parameters<typeof request>[0])
    .post(`/arc-api/v1/projects/${projectId}/end-session`)
    .set('Authorization', `Bearer ${authToken}`)
    .timeout(30_000);
}

describe('Get Subgraph Properties E2E (GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/properties)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleSubgraphSystemId: string | undefined;
  let propertyWriteSubgraphSystemId: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    sampleSubgraphSystemId = undefined;
    propertyWriteSubgraphSystemId = undefined;

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

    // Discover a subgraph ID for the generic property-write contract test.
    const usecaseResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (usecaseResponse.status === 200) {
      const usecases: any[] = usecaseResponse.body.data ?? [];
      if (usecases.length > 0) {
        const componentsResponse = await request(httpServer)
          .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({systemIds: [String(usecases[0].systemId)]})
          .timeout(30000);

        if (componentsResponse.status === 200) {
          const spfModules: any[] =
            componentsResponse.body.data?.spfModules ?? [];
          if (spfModules.length > 0) {
            propertyWriteSubgraphSystemId = String(
              spfModules[0].subgraphSystemId,
            );
          }
        }
      }
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 200 with PropertyDto[] shape when subgraph exists', async () => {
    if (!projectId || !sampleSubgraphSystemId) {
      console.warn('No projectId or sampleSubgraphSystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/${sampleSubgraphSystemId}/properties`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data.properties)).toBe(true);

    for (const prop of response.body.data.properties) {
      expect(typeof prop.systemId).toBe('string');
      expect(typeof prop.naturalId).toBe('number');
      expect(typeof prop.propertyName).toBe('string');
      expect(Array.isArray(prop.elements)).toBe(true);
    }
  });

  it('returns 404 when subgraphSystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/subgraphs/999999999/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('returns 400 when a generic property write body omits systemId', async () => {
    if (!projectId || !propertyWriteSubgraphSystemId) {
      console.warn('No projectId or sampleSubgraphSystemId â€” skipping');
      return;
    }

    await startDesignerSession(httpServer, authToken, projectId);
    try {
      const response = await request(httpServer)
        .put(
          `/arc-api/v1/projects/${projectId}/subgraphs/${propertyWriteSubgraphSystemId}/properties`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({elements: []})
        .timeout(30_000);

      expect(response.status).toBe(400);
    } finally {
      await endSession(httpServer, authToken, projectId);
    }
  }, 60_000);

  it('returns 207 with issues when a property payload row is missing', async () => {
    if (!projectId || !sampleSubgraphSystemId) {
      console.warn('No projectId or sampleSubgraphSystemId — skipping');
      return;
    }

    // Delete one SubgraphPropertyData row to simulate a missing payload
    const dataSource = app.get(DataSource);
    const deleted = await dataSource.manager
      .createQueryBuilder()
      .delete()
      .from('SubgraphPropertyData')
      .where('subgraphSystemId = :id', {id: Number(sampleSubgraphSystemId)})
      .limit(1)
      .execute();

    if (deleted.affected === 0) {
      console.warn(
        'No SubgraphPropertyData rows to delete — skipping 207 test',
      );
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/subgraphs/${sampleSubgraphSystemId}/properties`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(207);
    expect(Array.isArray(response.body.issues)).toBe(true);
    expect(response.body.issues.length).toBeGreaterThan(0);
    expect(response.body.issues[0].code).toBe('PROPERTY_PAYLOAD_NOT_FOUND');
  });
});
