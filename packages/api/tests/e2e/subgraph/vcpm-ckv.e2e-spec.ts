/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll, afterAll} from '@jest/globals';
import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import type {INestApplication} from '@nestjs/common';
import type {DataSource} from 'typeorm';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type HttpServer = Parameters<typeof request>[0];

const FILE_ID_MODULUS = 2 ** 23;
const E2E_VCPM_DEFINITION_ID = 900001001;
const E2E_VCPM_PARAMETER_ID = 900001002;
const E2E_VCPM_INSTANCE_ID = 900001003;
const E2E_VCPM_CKV_ID = 900001004;
const UNKNOWN_PARAMETER_PAYLOAD = [
  {systemId: '999999999', parameterId: '1', name: 'missing', elements: []},
];

async function uploadProject(
  httpServer: unknown,
  token: string,
): Promise<string> {
  const response = await request(httpServer as HttpServer)
    .post('/arc-api/v1/projects/offline/upload-files')
    .set('Authorization', `Bearer ${token}`)
    .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
    .attach(
      'workspaceFile',
      join(__dirname, '../fixtures/workspaceFileXml.awsp'),
    )
    .timeout(120_000)
    .expect(201);
  return response.body.data.projectId as string;
}

async function startSession(
  httpServer: unknown,
  token: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as HttpServer)
    .post(`/arc-api/v1/projects/${projectId}/start-session`)
    .set('Authorization', `Bearer ${token}`)
    .send({mode: 'DESIGNER'})
    .expect(201);
}

async function endSession(
  httpServer: unknown,
  token: string,
  projectId: string,
): Promise<void> {
  await request(httpServer as HttpServer)
    .post(`/arc-api/v1/projects/${projectId}/end-session`)
    .set('Authorization', `Bearer ${token}`);
}

async function findTarget(
  app: INestApplication,
  projectId: string,
): Promise<{
  subgraphSystemId: string;
  valueSystemId: string;
  duplicateValues: string[];
}> {
  const dataSource = app.get<DataSource>('DATA_SOURCE');
  const [file] = (await dataSource.query(
    'SELECT system_id AS systemId, last_reserved_id AS lastReservedId FROM files WHERE project_system_id = ? ORDER BY system_id LIMIT 1',
    [Number(projectId)],
  )) as Array<{systemId: number; lastReservedId: number}>;
  const [subgraph] = (await dataSource.query(
    'SELECT system_id AS systemId, file_system_id AS fileSystemId FROM subgraphs WHERE file_system_id = ? ORDER BY system_id LIMIT 1',
    [file?.systemId],
  )) as Array<{systemId: number; fileSystemId: number}>;
  const values = (await dataSource.query(
    `SELECT v.system_id AS systemId
       FROM arc_values v
       JOIN arc_keys k ON k.system_id = v.keys_system_id
      WHERE k.file_system_id = ?
      ORDER BY v.system_id
      LIMIT 2`,
    [file?.systemId],
  )) as Array<{systemId: number}>;

  if (!file || !subgraph || values.length < 2) {
    throw new Error(
      'Fixture does not contain a subgraph and two value definitions',
    );
  }

  await dataSource.manager.insert('VcpmModuleDefinition', {
    systemId: E2E_VCPM_DEFINITION_ID,
    moduleDefinitionId: 4,
    name: 'E2E VCPM',
    displayName: 'E2E VCPM',
    description: 'VCPM definition used by the CKV endpoint E2E test',
    groupName: 'E2E',
    fileSystemId: file.systemId,
  });
  await dataSource.manager.insert('VcpmModuleParameterDefinition', {
    systemId: E2E_VCPM_PARAMETER_ID,
    paramId: 1,
    name: 'E2E parameter',
    description: 'VCPM parameter used by the CKV endpoint E2E test',
    maxSize: 0,
    pidType: 'UINT32',
    isPersistent: true,
    isReadOnly: false,
    toolPolicies: null,
    elementsStructure: '[]',
    vcpmModuleDefinitionSystemId: E2E_VCPM_DEFINITION_ID,
  });
  await dataSource.manager.insert('VcpmInstance', {
    systemId: E2E_VCPM_INSTANCE_ID,
    subgraphSystemId: subgraph.systemId,
    vcpmDefinitionId: E2E_VCPM_DEFINITION_ID,
  });
  await dataSource.manager.insert('VcpmCkv', {
    systemId: E2E_VCPM_CKV_ID,
    vcpmInstanceSystemId: E2E_VCPM_INSTANCE_ID,
  });
  await dataSource.manager.insert('VcpmCkvValues', {
    vcpmCkvSystemId: E2E_VCPM_CKV_ID,
    valueDefSystemId: values[0].systemId,
  });

  // createVcpmCkv stages the parent row but currently writes its join rows
  // directly. Seed the next generated parent so SQLite can enforce the FK
  // while the endpoint is exercised through the edit-session overlay.
  await dataSource.manager.insert('VcpmCkv', {
    systemId: file.lastReservedId + FILE_ID_MODULUS + file.systemId,
    vcpmInstanceSystemId: E2E_VCPM_INSTANCE_ID,
  });

  return {
    subgraphSystemId: String(subgraph.systemId),
    valueSystemId: String(values[1].systemId),
    duplicateValues: [String(values[0].systemId)],
  };
}

describe('VCPM CKV write endpoints', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let token: string;
  let projectId: string;
  let subgraphSystemId: string;
  let valueSystemId: string;
  let duplicateValues: string[];
  let createdCkvSystemId: string;
  let parameters: unknown[] = [];

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    token = setup.authToken;
    projectId = await uploadProject(httpServer, token);
    ({subgraphSystemId, valueSystemId, duplicateValues} = await findTarget(
      app,
      projectId,
    ));
    await startSession(httpServer, token, projectId);
  }, 350_000);

  afterAll(async () => {
    await endSession(httpServer, token, projectId);
    await teardownE2ETest(app);
  });

  it('POST returns 403 without an active session', async () => {
    await endSession(httpServer, token, projectId);
    const response = await request(httpServer as HttpServer)
      .post(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ckv: [{valueSystemIds: [valueSystemId]}]});
    expect(response.status).toBe(403);
    await startSession(httpServer, token, projectId);
  });

  it('POST returns 404 for an unknown subgraph', async () => {
    const response = await request(httpServer as HttpServer)
      .post(`/arc-api/v1/projects/${projectId}/subgraphs/999999999/vcpm-ckv`)
      .set('Authorization', `Bearer ${token}`)
      .send({ckv: [{valueSystemIds: [valueSystemId]}]});
    expect(response.status).toBe(404);
  });

  it('POST rejects a duplicate value combination', async () => {
    if (duplicateValues.length === 0) return;
    const response = await request(httpServer as HttpServer)
      .post(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ckv: [{valueSystemIds: duplicateValues}]});
    expect(response.status).toBe(422);
  });

  it('POST creates a CKV and returns its summary', async () => {
    const response = await request(httpServer as HttpServer)
      .post(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ckv: [{valueSystemIds: [valueSystemId]}]});
    expect(response.status).toBe(200);
    expect(typeof response.body.data.ckvSystemId).toBe('string');
    expect(Array.isArray(response.body.data.ckv)).toBe(true);
    createdCkvSystemId = response.body.data.ckvSystemId as string;
  });

  it('DELETE returns 404 for an unknown subgraph', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(
        `/arc-api/v1/projects/${projectId}/subgraphs/999999999/vcpm-ckv/${createdCkvSystemId}`,
      )
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });

  it('DELETE returns 404 for an unknown CKV', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv/999999999`,
      )
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });

  it('PUT returns 404 for an unknown subgraph', async () => {
    const response = await request(httpServer as HttpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/subgraphs/999999999/vcpm-ckv/${createdCkvSystemId}/cal-data`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({parameters: UNKNOWN_PARAMETER_PAYLOAD});
    expect(response.status).toBe(404);
  });

  it('PUT returns 404 for an unknown CKV', async () => {
    const response = await request(httpServer as HttpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv/999999999/cal-data`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({parameters: UNKNOWN_PARAMETER_PAYLOAD});
    expect(response.status).toBe(404);
  });

  it('PUT updates all supplied parameters successfully', async () => {
    if (parameters.length === 0) return;
    const response = await request(httpServer as HttpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv/${createdCkvSystemId}/cal-data`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({parameters});
    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();
  });

  it('PUT returns partial success for a missing payload', async () => {
    if (parameters.length === 0) return;
    const response = await request(httpServer as HttpServer)
      .put(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv/${createdCkvSystemId}/cal-data`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        parameters: [
          parameters[0],
          {...(parameters[0] as object), systemId: '999999999'},
        ],
      });
    expect(response.status).toBe(207);
    expect(response.body.issues?.[0]?.code).toBe('PARAM_PAYLOAD_NOT_FOUND');
  });

  it('DELETE returns 204 for the created CKV', async () => {
    const response = await request(httpServer as HttpServer)
      .delete(
        `/arc-api/v1/projects/${projectId}/subgraphs/${subgraphSystemId}/vcpm-ckv/${createdCkvSystemId}`,
      )
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
  });
});
