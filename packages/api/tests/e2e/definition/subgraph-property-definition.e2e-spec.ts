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

describe('Subgraph Property Definition Query E2E (GET /arc-api/v1/projects/{projectId}/definitions/subgraph/properties)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let samplePropertySystemId: string | undefined;
  let samplePropertyId: number | undefined;

  beforeAll(async () => {
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
    projectId = undefined;

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

    const listResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/subgraph/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (listResponse.status !== 200) return;

    const properties: any[] = listResponse.body.data ?? [];
    if (properties.length > 0) {
      samplePropertySystemId = String(properties[0].systemId);
      samplePropertyId = properties[0].propertyId;
    }
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return subgraph property definitions with correct summary shape', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/subgraph/properties`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const property of response.body.data) {
      expect(typeof property.systemId).toBe('string');
      expect(typeof property.propertyId).toBe('number');
      expect(typeof property.name).toBe('string');
      expect(typeof property.type).toBe('string');
      expect(typeof property.isVoice).toBe('boolean');
      expect(property.elements).toBeUndefined();
    }
  });

  it('should filter by propertyDefinitionId when provided', async () => {
    if (!projectId || samplePropertyId === undefined) {
      console.warn('No projectId or samplePropertyId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties?propertyDefinitionId=${samplePropertyId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const property of response.body.data) {
      expect(property.propertyId).toBe(samplePropertyId);
    }
  });

  it('should return HTTP 200 with empty array when propertyDefinitionId filter matches nothing', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties?propertyDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/definitions/subgraph/properties')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return a single subgraph property definition by systemId with detail shape', async () => {
    if (!projectId || !samplePropertySystemId) {
      console.warn('No projectId or samplePropertySystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/${samplePropertySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(typeof response.body.data.systemId).toBe('string');
    expect(typeof response.body.data.propertyId).toBe('number');
    expect(typeof response.body.data.name).toBe('string');
    expect(typeof response.body.data.type).toBe('string');
    expect(typeof response.body.data.isVoice).toBe('boolean');
    expect(response.body.data.elements).toBeUndefined();
  });

  it('should return HTTP 404 when propertySystemId does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 400 when propertySystemId is not a valid number', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/subgraph/properties/not-a-number`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });
});
