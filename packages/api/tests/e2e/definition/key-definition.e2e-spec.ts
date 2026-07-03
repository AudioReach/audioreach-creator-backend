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

describe('Key Definition Query E2E (GET /arc-api/v1/projects/{projectId}/definitions/keys)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleKeySystemId: string | undefined;
  let sampleKeyId: number | undefined;

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
      .get(`/arc-api/v1/projects/${projectId}/definitions/keys`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (listResponse.status !== 200) return;

    const keys: any[] = listResponse.body.data ?? [];
    if (keys.length > 0) {
      sampleKeySystemId = String(keys[0].systemId);
      sampleKeyId = keys[0].keyId;
    }

    console.log(
      `[KeyDefinition E2E] projectId=${projectId}, sampleKeySystemId=${sampleKeySystemId}`,
    );
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return key definitions with correct shape', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/keys`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const key of response.body.data) {
      expect(typeof key.systemId).toBe('string');
      expect(typeof key.keyId).toBe('number');
      expect(typeof key.name).toBe('string');
      expect(typeof key.isVoice).toBe('boolean');
      expect(typeof key.isDynamic).toBe('boolean');
      expect(typeof key.isCalibrationKey).toBe('boolean');
      expect(typeof key.isGraphKey).toBe('boolean');
      expect(Array.isArray(key.values)).toBe(true);

      for (const value of key.values) {
        expect(typeof value.systemId).toBe('string');
        expect(typeof value.valueId).toBe('number');
        expect(typeof value.name).toBe('string');
      }
    }
  });

  it('should filter by keyDefinitionId when provided', async () => {
    if (!projectId || sampleKeyId === undefined) {
      console.warn('No projectId or sampleKeyId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/keys?keyDefinitionId=${sampleKeyId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const key of response.body.data) {
      expect(key.keyId).toBe(sampleKeyId);
    }
  });

  it('should return HTTP 200 with empty array when keyDefinitionId filter matches nothing', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/keys?keyDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/definitions/keys')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return a single key definition with correct shape', async () => {
    if (!projectId || !sampleKeySystemId) {
      console.warn('No projectId or sampleKeySystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/keys/${sampleKeySystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    const key = response.body.data;
    expect(key.systemId).toBe(sampleKeySystemId);
    expect(typeof key.keyId).toBe('number');
    expect(typeof key.name).toBe('string');
    expect(typeof key.isVoice).toBe('boolean');
    expect(typeof key.isDynamic).toBe('boolean');
    expect(typeof key.isCalibrationKey).toBe('boolean');
    expect(typeof key.isGraphKey).toBe('boolean');
    expect(Array.isArray(key.values)).toBe(true);
  });

  it('should return HTTP 404 when the key system ID does not exist', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/keys/999999999`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(404);
  });

  it('should return HTTP 400 when keySystemId is not a valid number', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/keys/not-a-number`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });
}, 400000);
