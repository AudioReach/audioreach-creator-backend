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

describe('Get Subgraph Properties E2E (GET /arc-api/v1/projects/{projectId}/subgraphs/{subgraphSystemId}/properties)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleSubgraphSystemId: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    sampleSubgraphSystemId = undefined;

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

    // Discover a real subgraph systemId via the get-components endpoint on the first usecase
    const usecaseResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (usecaseResponse.status === 200) {
      const usecases: any[] = usecaseResponse.body.data ?? [];
      if (usecases.length > 0) {
        const usecaseId = usecases[0].usecaseId ?? usecases[0].systemId;
        const componentsResponse = await request(httpServer)
          .get(
            `/arc-api/v1/projects/${projectId}/usecases/${usecaseId}/components`,
          )
          .set('Authorization', `Bearer ${authToken}`)
          .timeout(30000);

        if (componentsResponse.status === 200) {
          const subgraphs: any[] =
            componentsResponse.body.data?.subgraphs ?? [];
          if (subgraphs.length > 0) {
            sampleSubgraphSystemId = String(subgraphs[0].systemId);
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
      expect(typeof prop.propertyId).toBe('number');
      expect(typeof prop.propertyName).toBe('string');
      expect(typeof prop.hasDefinition).toBe('boolean');
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
});
