/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {INestApplication} from '@nestjs/common';
import type {Logger as PinoLogger} from 'pino';
import type {ServerLogRecord} from '@arc/logger';
import {
  E2E_CLIENT_NAME,
  setupE2ETest,
  teardownE2ETest,
} from '../helpers/e2e-test-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEADER = 'X-ARC-Client-Instance-Id';
/** Records the middleware writes before routing and authentication. */
const PRE_ROUTING_MSGS = new Set(['incomingRequest', 'requestHeaders']);
const PINO_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const;

/**
 * Design §6.2 / §18: every record written while handling a request carries
 * that request's `X-ARC-Client-Instance-Id`, through guards, pipes, filters,
 * controllers, and the CQRS buses, even when requests overlap. Records
 * written once the route is matched also carry its project ID, and records
 * written once the token is verified also carry the client name.
 */
describe('Request log context E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let projectId: string;
  let records: ServerLogRecord[];

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;

    // Records reach Pino after PinoLogService enrichment; capture them there.
    const pino = app.get<PinoLogger>('PINO_LOGGER');
    records = [];
    for (const level of PINO_LEVELS) {
      const original = pino[level].bind(pino) as (obj: unknown) => void;
      (pino as unknown as Record<string, unknown>)[level] = (obj: unknown) => {
        records.push(obj as ServerLogRecord);
        original(obj);
      };
    }

    const res = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', join(__dirname, '../fixtures/acdb_cal.acdb'))
      .attach(
        'workspaceFile',
        join(__dirname, '../fixtures/workspaceFileXml.awsp'),
      )
      .timeout(300000)
      .expect(201);
    projectId = String(res.body.data.projectId);
  }, 350000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  beforeEach(() => {
    records.length = 0;
  });

  const patch = (id: string, clientInstanceId: string, body: object) =>
    request(httpServer)
      .patch(`/arc-api/v1/projects/${id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set(HEADER, clientInstanceId)
      .send(body)
      .timeout(10000);

  const withMsg = (msg: string) => records.filter(r => r.msg === msg);

  it('adds the server producer identity to every record', async () => {
    await patch(projectId, randomUUID(), {name: 'producer'}).expect(200);

    expect(records.length).toBeGreaterThan(0);
    const instanceIds = new Set(records.map(r => r.serviceInstanceId));
    expect(instanceIds.size).toBe(1);
    expect(records.every(r => r.serviceName === 'audioreach-creator-api')).toBe(
      true,
    );
  });

  it('adds the verified client name and the route project ID after routing', async () => {
    const launch = randomUUID();
    await patch(projectId, launch, {name: 'labels'}).expect(200);

    const early = records.filter(r => PRE_ROUTING_MSGS.has(r.msg));
    const later = records.filter(r => !PRE_ROUTING_MSGS.has(r.msg));
    expect(early.length).toBeGreaterThan(0);
    expect(later.length).toBeGreaterThan(0);
    expect(records.every(r => r.clientInstanceId === launch)).toBe(true);
    expect(early.some(r => 'clientName' in r || 'projectId' in r)).toBe(false);
    expect(later.every(r => r.clientName === E2E_CLIENT_NAME)).toBe(true);
    expect(withMsg('outgoingResponse').map(r => r.projectId)).toEqual([
      projectId,
    ]);
  });

  it('leaves out the client name and project ID when the request has neither', async () => {
    await request(httpServer)
      .get('/arc-api/v1/projects')
      .timeout(10000)
      .expect(401);

    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => 'clientName' in r)).toBe(false);
    expect(records.some(r => 'projectId' in r)).toBe(false);
  });

  it('never logs the client name of a token that fails verification', async () => {
    const forged = [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(
        JSON.stringify({clientId: 'c1', clientName: 'forged-name'}),
      ).toString('base64url'),
      'bad-signature',
    ].join('.');

    await request(httpServer)
      .patch(`/arc-api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${forged}`)
      .send({name: 'forged'})
      .timeout(10000)
      .expect(401);

    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => 'clientName' in r)).toBe(false);
    // The project is added before authentication, so the 401 carries it.
    expect(withMsg('outgoingResponse').map(r => r.projectId)).toEqual([
      projectId,
    ]);
  });

  it('keeps overlapping requests in their own context', async () => {
    const rounds = 4;
    const ok = Array.from({length: rounds}, () => randomUUID());
    const missing = Array.from({length: rounds}, () => randomUUID());
    const invalid = Array.from({length: rounds}, () => randomUUID());

    // Rounds run one after another so that only one write transaction is in
    // flight: concurrent writes on the shared SQLite connection fail in
    // TypeORM, which is unrelated to logging. Within a round, requests overlap.
    const statuses: number[] = [];
    for (let i = 0; i < rounds; i++) {
      const responses = await Promise.all([
        // Guard, pipe, controller, CommandBus success, QueryBus.
        patch(projectId, ok[i], {name: `round-${i}`}),
        // CommandBus failure and AllExceptionsFilter.
        patch('999999', missing[i], {name: 'missing'}),
        // ValidationPipe rejection and ValidationExceptionFilter.
        patch(projectId, invalid[i], {unexpected: true}),
      ]);
      statuses.push(...responses.map(r => r.status));
    }
    expect(statuses).toEqual(ok.flatMap(() => [200, 404, 400]));

    const ids = (msg: string) =>
      new Set(withMsg(msg).map(r => r.clientInstanceId));

    // Records written by the bus and the exception filters carry the
    // client name and the route's project ID as well.
    for (const r of withMsg('command-execution-error')) {
      expect(r.clientName).toBe(E2E_CLIENT_NAME);
      expect(r.projectId).toBe('999999');
    }

    expect(ids('command-execution-success')).toEqual(new Set(ok));
    expect(ids('command-execution-error')).toEqual(new Set(missing));
    expect(ids('validationFailed')).toEqual(new Set(invalid));
    expect(ids('incomingRequest')).toEqual(
      new Set([...ok, ...missing, ...invalid]),
    );
    expect(ids('outgoingResponse')).toEqual(
      new Set([...ok, ...missing, ...invalid]),
    );

    // Each request's own access-log records agree with its header.
    const byTag = new Map<string, Set<string | undefined>>();
    for (const r of records.filter(r => r.component === 'RequestLogger')) {
      const set = byTag.get(r.tag) ?? new Set();
      set.add(r.clientInstanceId);
      byTag.set(r.tag, set);
    }
    expect(byTag.size).toBe(rounds * 3);
    for (const set of byTag.values()) {
      expect(set.size).toBe(1);
    }
  });

  it('never logs the request body, even when validation rejects it', async () => {
    const secret = `s3cr3t-${randomUUID()}`;
    await patch(projectId, randomUUID(), {
      password: secret,
      nested: {token: secret},
    }).expect(400);

    expect(withMsg('validationFailed')).toHaveLength(1);
    expect(withMsg('validationFailed')[0].error).toContain(
      'property password should not exist',
    );
    expect(records.some(r => r.msg === 'requestBody')).toBe(false);
    expect(records.some(r => r.msg === 'requestDetails')).toBe(false);
    expect(JSON.stringify(records)).not.toContain(secret);
  });

  it('ignores an invalid header without failing the request', async () => {
    await patch(projectId, 'not-a-uuid', {name: 'invalid-header'}).expect(200);

    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => 'clientInstanceId' in r)).toBe(false);
  });

  it('accepts the header in a CORS preflight', async () => {
    const res = await request(httpServer)
      .options(`/arc-api/v1/projects/${projectId}`)
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', HEADER)
      .timeout(10000);

    expect(res.status).toBe(204);
    expect(
      String(res.headers['access-control-allow-headers']).toLowerCase(),
    ).toContain(HEADER.toLowerCase());
  });
});
