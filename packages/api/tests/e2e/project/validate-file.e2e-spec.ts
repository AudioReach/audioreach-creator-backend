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

describe('POST /arc-api/v1/projects/:projectId/validate — request handling', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 30000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  it('returns 400 for a group that is not defined', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/1/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({group: 'NOPE'});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric projectId', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/abc/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for a project that does not exist', async () => {
    const res = await request(httpServer)
      .post('/arc-api/v1/projects/999999/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /arc-api/v1/projects/:projectId/validate — ARC-MOD-005 end to end', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let targetModuleSystemId: number;

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

    // A module that has a non-zero CKV and no zero-key CKV yet.
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
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  const validate = (body?: object) => {
    const req = request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/validate`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(60000);
    return body === undefined ? req : req.send(body);
  };

  const mixedCkvIssuesForTarget = (res: request.Response): any[] =>
    (res.body.issues ?? []).filter(
      (issue: any) =>
        issue.code === 'ARC-MOD-005' &&
        issue.impactedEntity?.systemId === String(targetModuleSystemId),
    );

  it('returns the report envelope and does not flag the module before it is seeded', async () => {
    const res = await validate({});

    expect(res.status).toBe(200);
    expect(res.body.data.group).toBe('SAVE_FILE');
    expect(typeof res.body.data.fileSystemId).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.data.runAt))).toBe(false);
    expect(typeof res.body.data.summary.total).toBe('number');
    expect(mixedCkvIssuesForTarget(res)).toHaveLength(0);
  });

  it('reports ARC-MOD-005 once the module has a zero-key CKV next to a non-zero CKV', async () => {
    const dataSource = await app.get(DataSourceProvider).getDataSource();
    await dataSource.manager.query(
      `INSERT INTO ckv (system_id, spf_module_system_id)
       VALUES ((SELECT COALESCE(MAX(system_id), 0) + 1 FROM ckv), ?)`,
      [targetModuleSystemId],
    );

    const res = await validate({group: 'SAVE_FILE'});

    expect(res.status).toBe(200);
    expect(res.body.data.blockedSave).toBe(true);
    expect(res.body.data.summary.blocking).toBeGreaterThanOrEqual(1);
    const issues = mixedCkvIssuesForTarget(res);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('ERROR');
    expect(issues[0].fixOptions[0].commandType).toBe('RemoveCkvCommand');
  });

  it('defaults to SAVE_FILE for an empty body and for no body', async () => {
    for (const res of [await validate({}), await validate()]) {
      expect(res.status).toBe(200);
      expect(res.body.data.group).toBe('SAVE_FILE');
      expect(mixedCkvIssuesForTarget(res)).toHaveLength(1);
    }
  });

  it('does not run ARC-MOD-005 for the UPLOAD_FILE group', async () => {
    const res = await validate({group: 'UPLOAD_FILE'});

    expect(res.status).toBe(200);
    expect(res.body.data.group).toBe('UPLOAD_FILE');
    expect(mixedCkvIssuesForTarget(res)).toHaveLength(0);
  });
});
