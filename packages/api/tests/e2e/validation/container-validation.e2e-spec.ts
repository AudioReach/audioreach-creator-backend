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

describe('POST /arc-api/v1/projects/:projectId/validate — ARC-CON-002 end to end', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let fileSystemId: number;
  let targetContainerSystemId: number;

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

    const dataSource = await app.get(DataSourceProvider).getDataSource();
    const fileRows = (await dataSource.manager.query(
      `SELECT system_id AS fileId FROM files WHERE project_system_id = ? LIMIT 1`,
      [Number(projectId)],
    )) as {fileId: number}[];
    if (fileRows.length === 0) {
      throw new Error('No file found for the uploaded project');
    }
    fileSystemId = fileRows[0].fileId;

    const containerRows = (await dataSource.manager.query(
      `SELECT system_id AS id FROM containers WHERE file_system_id = ? LIMIT 1`,
      [fileSystemId],
    )) as {id: number}[];
    if (containerRows.length === 0) {
      throw new Error('Fixture has no containers');
    }
    targetContainerSystemId = containerRows[0].id;
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

  const parseIssues = (res: request.Response): any[] =>
    (res.body.issues ?? []).filter(
      (issue: any) => issue.code === 'ARC-CON-002',
    );

  it('raises no ARC-CON-002 for the unmodified fixture', async () => {
    const res = await validate({group: 'SAVE_FILE'});

    expect(res.status).toBe(200);
    expect(parseIssues(res)).toHaveLength(0);
  });

  it('reports ARC-CON-002 once a container has a payload too short for its property structure', async () => {
    const dataSource = await app.get(DataSourceProvider).getDataSource();
    const propDefSystemId = (
      (await dataSource.manager.query(
        `SELECT COALESCE(MAX(system_id), 0) + 1 AS nextId FROM container_property_definitions`,
      )) as {nextId: number}[]
    )[0].nextId;
    // The structure is one UInt32 (4 bytes); the payload below is 1 byte.
    await dataSource.manager.query(
      `INSERT INTO container_property_definitions
         (system_id, file_system_id, property_id, name, max_size, property_type, elements_structure)
       VALUES (?, ?, ?, ?, 4, 'SPF', ?)`,
      [
        propDefSystemId,
        fileSystemId,
        0xdead,
        'e2e_corrupt_prop',
        JSON.stringify([
          {
            elementType: 'ConfigElement',
            name: 'val',
            dataType: 'UInt32',
            isReadOnly: false,
          },
        ]),
      ],
    );
    await dataSource.manager.query(
      `INSERT INTO container_property_data
         (system_id, container_system_id, property_system_id, payload)
       VALUES ((SELECT COALESCE(MAX(system_id), 0) + 1 FROM container_property_data), ?, ?, ?)`,
      [targetContainerSystemId, propDefSystemId, Buffer.from([0xff])],
    );

    const res = await validate({group: 'SAVE_FILE'});

    expect(res.status).toBe(200);
    expect(res.body.data.blockedSave).toBe(true);
    const issues = parseIssues(res).filter(
      issue =>
        issue.impactedEntity?.systemId === String(targetContainerSystemId),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('ERROR');
    expect(issues[0].fixOptions ?? []).toHaveLength(0);
  });
});

describe('POST /arc-api/v1/projects/:projectId/validate — ARC-CON-001 end to end', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let fileSystemId: number;

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

    const dataSource = await app.get(DataSourceProvider).getDataSource();
    const fileRows = (await dataSource.manager.query(
      `SELECT system_id AS fileId FROM files WHERE project_system_id = ? LIMIT 1`,
      [Number(projectId)],
    )) as {fileId: number}[];
    if (fileRows.length === 0) {
      throw new Error('No file found for the uploaded project');
    }
    fileSystemId = fileRows[0].fileId;
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

  const missingPropertyIssues = (res: request.Response): any[] =>
    (res.body.issues ?? []).filter(
      (issue: any) => issue.code === 'ARC-CON-001',
    );

  it('raises no ARC-CON-001 for the unmodified fixture', async () => {
    const res = await validate({group: 'SAVE_FILE'});

    expect(res.status).toBe(200);
    expect(missingPropertyIssues(res)).toHaveLength(0);
  });

  it('reports ARC-CON-001 once a container loses one of its property rows', async () => {
    const dataSource = await app.get(DataSourceProvider).getDataSource();
    const rows = (await dataSource.manager.query(
      `SELECT d.system_id AS dataId,
              d.container_system_id AS containerId,
              p.name AS propName
         FROM container_property_data d
         JOIN containers c ON c.system_id = d.container_system_id
         JOIN container_property_definitions p ON p.system_id = d.property_system_id
        WHERE c.file_system_id = ?
        LIMIT 1`,
      [fileSystemId],
    )) as {dataId: number; containerId: number; propName: string}[];
    if (rows.length === 0) {
      throw new Error('Fixture has no container property data to remove');
    }
    const {dataId, containerId, propName} = rows[0];
    await dataSource.manager.query(
      `DELETE FROM container_property_data WHERE system_id = ?`,
      [dataId],
    );

    const res = await validate({group: 'SAVE_FILE'});

    expect(res.status).toBe(200);
    expect(res.body.data.blockedSave).toBe(true);
    const issues = missingPropertyIssues(res).filter(
      issue => issue.impactedEntity?.systemId === String(containerId),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('ERROR');
    expect(issues[0].message).toContain(`'${propName}'`);
    expect(issues[0].fixOptions ?? []).toHaveLength(0);
  });
});
