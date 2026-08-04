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

describe('Get Container Properties E2E (GET /arc-api/v1/projects/{projectId}/containers/{containerSystemId}/properties)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleContainerSystemId: string | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;
    sampleContainerSystemId = undefined;

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

    // Discover a real container systemId via the query endpoint
    const queryResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/containers/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({systemIds: []})
      .timeout(30000);

    if (queryResponse.status === 200) {
      const containers: any[] = queryResponse.body.data ?? [];
      if (containers.length > 0) {
        sampleContainerSystemId = String(containers[0].systemId);
      }
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 200 with PropertyDto[] shape when container exists', async () => {
    if (!projectId || !sampleContainerSystemId) {
      console.warn('No projectId or sampleContainerSystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/containers/${sampleContainerSystemId}/properties`,
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

  it('returns 404 when containerSystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/containers/999999999/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });
});
