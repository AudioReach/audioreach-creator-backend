/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';
import {DataSourceProvider} from '../../../src/infrastructure-wrapper/database/providers/data-source-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('POST /arc-api/v1/projects/:projectId/apply-fix — request handling', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300000);

    projectId = String(uploadResponse.body.data.projectId);

    await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 400 for an unknown commandType', async () => {
    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/apply-fix`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({commandType: 'UnknownCommand', commandPayload: {}});

    expect(res.status).toBe(400);
  });
});

describe('POST /arc-api/v1/projects/:projectId/apply-fix — ARC-MOD-005 fix end to end', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let targetModuleSystemId: number;
  let zeroCkvSystemId: number;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300000);

    if (!uploadResponse.body?.data?.projectId) {
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${JSON.stringify(uploadResponse.body)}`,
      );
    }
    projectId = String(uploadResponse.body.data.projectId);

    // Find a module that has only non-zero CKVs so we can inject the mixed state.
    const dataSource = await app.get(DataSourceProvider).getDataSource();
    const rows = (await dataSource.manager.query(
      `SELECT c.spf_module_system_id AS moduleId
         FROM ckv c
         JOIN ckv_values v ON v.ckv_system_id = c.system_id
        WHERE c.spf_module_system_id NOT IN (
                SELECT z.spf_module_system_id
                  FROM ckv z
                 WHERE NOT EXISTS (
                         SELECT 1 FROM ckv_values zv WHERE zv.ckv_system_id = z.system_id))
        LIMIT 1`,
    )) as {moduleId: number}[];
    if (rows.length === 0) {
      throw new Error(
        'Fixture has no module with a non-zero CKV and no zero-key CKV',
      );
    }
    targetModuleSystemId = rows[0].moduleId;

    // Raw SQL insert to create the mixed-CKV condition (no API creates this state).
    const newId = (
      (await dataSource.manager.query(
        `SELECT COALESCE(MAX(system_id), 0) + 1 AS nextId FROM ckv`,
      )) as {nextId: number}[]
    )[0].nextId;
    zeroCkvSystemId = newId;
    await dataSource.manager.query(
      `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
      [zeroCkvSystemId, targetModuleSystemId],
    );
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('validate returns ARC-MOD-005 with RemoveCkvsCommand fix option', async () => {
    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/validate`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({group: 'SAVE_FILE'})
      .timeout(60000);

    expect(res.status).toBe(200);
    const issues = (res.body.issues ?? []).filter(
      (i: any) =>
        i.code === 'ARC-MOD-005' &&
        i.impactedEntity?.systemId === String(targetModuleSystemId),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fixOptions[0].commandType).toBe('RemoveCkvsCommand');
    expect(issues[0].fixOptions[0].commandPayload).toEqual({
      spfModuleSystemId: String(targetModuleSystemId),
      ckvSystemIds: [String(zeroCkvSystemId)],
    });
  });

  it('apply-fix dispatches RemoveCkvsCommand and returns 200', async () => {
    await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/start-session`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({mode: 'DESIGNER'})
      .expect(201);

    const res = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/apply-fix`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        commandType: 'RemoveCkvsCommand',
        commandPayload: {
          spfModuleSystemId: String(targetModuleSystemId),
          ckvSystemIds: [String(zeroCkvSystemId)],
        },
      });

    expect(res.status).toBe(200);
  });
});
