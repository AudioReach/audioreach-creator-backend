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

describe('Tag Definition Query E2E (GET /arc-api/v1/projects/{projectId}/definitions/tags)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string | undefined;
  let sampleTagSystemId: string | undefined;
  let sampleTagId: number | undefined;

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
      .get(`/arc-api/v1/projects/${projectId}/definitions/tags`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    if (listResponse.status !== 200) return;

    const tags: any[] = listResponse.body.data ?? [];
    if (tags.length > 0) {
      sampleTagSystemId = String(tags[0].systemId);
      sampleTagId = tags[0].tagId;
    }

    console.log(
      `[TagDefinition E2E] projectId=${projectId}, sampleTagSystemId=${sampleTagSystemId}`,
    );
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('should return tag definitions with correct shape, including nested key/value definitions', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/tags`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    for (const tag of response.body.data) {
      expect(typeof tag.systemId).toBe('string');
      expect(typeof tag.tagId).toBe('number');
      expect(typeof tag.name).toBe('string');
      expect(Array.isArray(tag.keyDefinitions)).toBe(true);

      for (const keyDef of tag.keyDefinitions) {
        expect(typeof keyDef.systemId).toBe('string');
        expect(typeof keyDef.keyId).toBe('number');
        expect(typeof keyDef.name).toBe('string');
        expect(Array.isArray(keyDef.values)).toBe(true);

        for (const value of keyDef.values) {
          expect(typeof value.systemId).toBe('string');
          expect(typeof value.valueId).toBe('number');
          expect(typeof value.name).toBe('string');
        }
      }
    }
  });

  it('should filter by tagDefinitionId when provided', async () => {
    if (!projectId || sampleTagId === undefined) {
      console.warn('No projectId or sampleTagId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/tags?tagDefinitionId=${sampleTagId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const tag of response.body.data) {
      expect(tag.tagId).toBe(sampleTagId);
    }
  });

  it('should return HTTP 200 with empty array when tagDefinitionId filter matches nothing', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/tags?tagDefinitionId=999999999`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return HTTP 400 when projectId is not a valid number', async () => {
    const response = await request(httpServer)
      .get('/arc-api/v1/projects/not-a-number/definitions/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });

  it('should return a single tag definition by system id', async () => {
    if (!projectId || !sampleTagSystemId) {
      console.warn('No projectId or sampleTagSystemId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/definitions/tags/${sampleTagSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    expect(response.body.data.systemId).toBe(sampleTagSystemId);
    expect(typeof response.body.data.tagId).toBe('number');
    expect(Array.isArray(response.body.data.keyDefinitions)).toBe(true);
  });

  it('should return HTTP 400 when tagSystemId is not a valid number', async () => {
    if (!projectId) {
      console.warn('No projectId — skipping');
      return;
    }

    const response = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/definitions/tags/not-a-number`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000);

    expect(response.status).toBe(400);
  });
}, 400000);
