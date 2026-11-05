/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {randomUUID} from 'node:crypto';
import type {INestApplication} from '@nestjs/common';
import {
  E2E_CLIENT_NAME,
  setupE2ETest,
  teardownE2ETest,
} from '../helpers/e2e-test-setup.js';

const HEADER = 'X-ARC-Client-Instance-Id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface LogItem {
  systemId: string;
  level: string;
  eventName: string;
  origin: 'CLIENT' | 'SERVER';
  clientName?: string;
  clientInstanceId?: string;
  serverInstanceId?: string;
  projectId?: string;
  timestamp: string;
}

interface ClientInstanceItem {
  clientName?: string;
  clientInstanceId: string;
  projectIds: string[];
  firstTimestamp: string;
  lastTimestamp: string;
  recordCount: number;
  errorCount: number;
}

type Query = Record<string, string | number>;

/** Design §7 and §10: the client write endpoint and the two read endpoints. */
describe('Log endpoints E2E', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    const setup = await setupE2ETest();
    app = setup.app;
    httpServer = setup.httpServer;
    authToken = setup.authToken;
  }, 120000);

  afterAll(async () => {
    await teardownE2ETest(app);
  });

  const register = async (clientName: string): Promise<string> => {
    const res = await request(httpServer)
      .post('/arc-api/v1/auth/register')
      .send({clientName})
      .timeout(10000)
      .expect(201);
    return res.body.data.token as string;
  };

  const submit = (
    body: Record<string, unknown>,
    // A new launch per call unless given; `null` sends no launch header.
    {
      launch = randomUUID(),
      token = authToken,
    }: {launch?: string | null; token?: string} = {},
  ) => {
    const req = request(httpServer)
      .post('/arc-api/v1/logs')
      .set('Authorization', `Bearer ${token}`);
    if (launch !== null) {
      req.set(HEADER, launch);
    }
    return req.send(body).timeout(10000);
  };

  const get = (path: string, query: Query = {}, launch?: string) => {
    const req = request(httpServer)
      .get(`/arc-api/v1/${path}`)
      .set('Authorization', `Bearer ${authToken}`)
      .query(query);
    if (launch) {
      req.set(HEADER, launch);
    }
    return req.timeout(10000);
  };

  // The SQLite transport writes asynchronously, so wait until the rows are
  // visible through the read endpoint. Reading a project's logs writes server
  // records into that project, so callers counting rows filter on origin.
  const waitForRows = async (
    path: string,
    query: Query,
    count: number,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const res = await get(path, {...query, limit: 1000});
      if (res.status === 200 && res.body.data.items.length >= count) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${count} rows from ${path}`);
  };

  const projectLogs = (projectId: string) => `projects/${projectId}/logs`;

  const record = (overrides: Record<string, unknown> = {}) => ({
    level: 'INFO',
    eventName: 'project.open.succeeded',
    description: 'Opened project Demo',
    timestamp: '2026-01-01T00:00:00.000Z',
    component: 'ProjectView',
    tag: 'project',
    ...overrides,
  });

  describe('GET /projects/:projectId/logs', () => {
    it('returns a submitted record under the client name from the token', async () => {
      const projectId = randomUUID();
      const launch = randomUUID();

      await submit(record({projectId}), {
        launch,
      }).expect(200);
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 1);

      const res = await get(projectLogs(projectId), {origin: 'CLIENT'}).expect(
        200,
      );

      expect(Object.keys(res.body).sort()).toEqual(['data']);
      expect(res.body.data.nextCursor).toBeUndefined();
      expect(res.body.data.items).toHaveLength(1);
      const [item] = res.body.data.items as LogItem[];
      expect(item).toMatchObject({
        eventName: 'project.open.succeeded',
        origin: 'CLIENT',
        clientName: E2E_CLIENT_NAME,
        clientInstanceId: launch,
        projectId,
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(typeof item.systemId).toBe('string');
      expect(item).not.toHaveProperty('serverInstanceId');
      expect(item).not.toHaveProperty('serviceName');
      expect(item).not.toHaveProperty('serviceInstanceId');
    });

    it('labels server records with the token name, the header launch and the URL project', async () => {
      const projectId = randomUUID();
      const launch = randomUUID();

      // Any request to a project route writes server records for it.
      await get(projectLogs(projectId), {}, launch).expect(200);
      await waitForRows(
        projectLogs(projectId),
        {origin: 'SERVER', clientInstanceId: launch},
        2,
      );

      const res = await get(projectLogs(projectId), {
        origin: 'SERVER',
        clientInstanceId: launch,
      }).expect(200);
      const items = res.body.data.items as LogItem[];

      expect(items.length).toBeGreaterThanOrEqual(2);
      for (const item of items) {
        expect(item).toMatchObject({
          origin: 'SERVER',
          clientName: E2E_CLIENT_NAME,
          clientInstanceId: launch,
          projectId,
        });
        expect(item.serverInstanceId).toMatch(UUID);
      }
      expect(new Set(items.map(i => i.serverInstanceId)).size).toBe(1);
    });

    it('matches a launch on both its own and its server records, regardless of case', async () => {
      const projectId = randomUUID();
      const launch = randomUUID();

      await submit(record({projectId, eventName: 'ui.started'}), {
        launch,
      }).expect(200);
      await get(projectLogs(projectId), {}, launch).expect(200);
      await waitForRows(
        projectLogs(projectId),
        {origin: 'SERVER', clientInstanceId: launch},
        1,
      );
      await waitForRows(
        projectLogs(projectId),
        {origin: 'CLIENT', clientInstanceId: launch},
        1,
      );

      const res = await get(projectLogs(projectId), {
        clientInstanceId: launch.toUpperCase(),
        order: 'asc',
      }).expect(200);
      const items = res.body.data.items as LogItem[];

      expect(items.every(i => i.clientInstanceId === launch)).toBe(true);
      expect(
        items.filter(i => i.origin === 'CLIENT').map(i => i.eventName),
      ).toEqual(['ui.started']);
      expect(items.some(i => i.origin === 'SERVER')).toBe(true);
    });

    it('filters by client name, and filters that disagree return nothing', async () => {
      const projectId = randomUUID();
      const otherName = `other-client-${randomUUID()}`;
      const otherToken = await register(otherName);
      const otherLaunch = randomUUID();

      await submit(record({projectId}), {
        token: otherToken,
        launch: otherLaunch,
      }).expect(200);
      await submit(record({projectId})).expect(200);
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 2);

      const other = await get(projectLogs(projectId), {
        clientName: otherName,
      }).expect(200);
      expect(
        (other.body.data.items as LogItem[]).map(i => [i.clientName, i.origin]),
      ).toEqual([[otherName, 'CLIENT']]);

      const mine = await get(projectLogs(projectId), {
        clientName: E2E_CLIENT_NAME,
        origin: 'CLIENT',
      }).expect(200);
      expect(mine.body.data.items).toHaveLength(1);

      const disagree = await get(projectLogs(projectId), {
        clientName: E2E_CLIENT_NAME,
        clientInstanceId: otherLaunch,
      }).expect(200);
      expect(disagree.body.data.items).toEqual([]);
    });

    it('filters by minLevel: that level and every more severe one', async () => {
      const projectId = randomUUID();
      const launch = randomUUID();
      for (const level of ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL']) {
        await submit(
          record({
            projectId,
            level,
            eventName: level,
          }),
          {launch},
        ).expect(200);
      }
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 5);

      const res = await get(projectLogs(projectId), {
        origin: 'CLIENT',
        minLevel: 'WARN',
      }).expect(200);

      expect(
        (res.body.data.items as LogItem[]).map(i => i.level).sort(),
      ).toEqual(['CRITICAL', 'ERROR', 'WARN']);
    });

    it('pages with nextCursor until the last page', async () => {
      const projectId = randomUUID();
      for (let s = 0; s < 5; s++) {
        await submit(
          record({projectId, timestamp: `2026-01-01T00:00:0${s}.000Z`}),
        ).expect(200);
      }
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 5);

      const seen: string[] = [];
      const totalCounts: unknown[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await get(projectLogs(projectId), {
          origin: 'CLIENT',
          limit: 2,
          ...(cursor ? {cursor} : {}),
        }).expect(200);
        seen.push(...(res.body.data.items as LogItem[]).map(i => i.timestamp));
        totalCounts.push(res.body.data.totalCount);
        cursor = res.body.data.nextCursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(3);
      // Only the first page (no cursor) carries the count of the filter.
      expect(totalCounts).toEqual([5, undefined, undefined]);
      expect(seen).toEqual(
        [4, 3, 2, 1, 0].map(s => `2026-01-01T00:00:0${s}.000Z`),
      );
    });
  });

  describe('GET /client-instances', () => {
    it('summarizes the project records of a launch', async () => {
      const [p1, p2] = [randomUUID(), randomUUID()].sort();
      const launch = randomUUID();
      const clientName = `summary-client-${randomUUID()}`;
      const token = await register(clientName);

      await submit(
        record({
          projectId: p2,
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
        {token, launch},
      ).expect(200);
      await submit(
        record({
          projectId: p1,
          level: 'ERROR',
          timestamp: '2026-01-01T00:00:03.000Z',
        }),
        {token, launch},
      ).expect(200);
      // Records without a project do not count.
      await submit(record(), {token, launch}).expect(200);
      await waitForRows(projectLogs(p1), {origin: 'CLIENT'}, 1);
      await waitForRows(projectLogs(p2), {origin: 'CLIENT'}, 1);

      const res = await get('client-instances', {clientName}).expect(200);

      expect(res.body.data.nextCursor).toBeUndefined();
      expect(res.body.data.items as ClientInstanceItem[]).toEqual([
        {
          clientName,
          clientInstanceId: launch,
          projectIds: [p1, p2],
          firstTimestamp: '2026-01-01T00:00:01.000Z',
          lastTimestamp: '2026-01-01T00:00:03.000Z',
          recordCount: 2,
          errorCount: 1,
        },
      ]);
    });

    it('lists two clients that send the same launch ID as separate launches', async () => {
      const launch = randomUUID();
      const projectId = randomUUID();
      const names = [`owner-${randomUUID()}`, `reuser-${randomUUID()}`];
      for (const clientName of names) {
        const token = await register(clientName);
        await submit(
          record({
            projectId,
            // Later than every other test, so these are the newest launches.
            timestamp: '2030-01-01T00:00:00.000Z',
          }),
          {token, launch},
        ).expect(200);
      }
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 2);

      const res = await get('client-instances', {limit: 10}).expect(200);

      const rows = (res.body.data.items as ClientInstanceItem[]).filter(
        i => i.clientInstanceId === launch,
      );
      expect(rows.map(i => [i.clientName, i.recordCount]).sort()).toEqual(
        names.map(n => [n, 1]).sort(),
      );
      const own = await get(projectLogs(projectId), {
        clientName: names[0],
        clientInstanceId: launch,
        origin: 'CLIENT',
      }).expect(200);
      expect(own.body.data.items).toHaveLength(1);
      expect(own.body.data.items[0].clientName).toBe(names[0]);
    });

    it('pages newest launch first, and binds the cursor to the filter', async () => {
      const clientName = `paging-client-${randomUUID()}`;
      const token = await register(clientName);
      const projectId = randomUUID();
      const launches = [randomUUID(), randomUUID(), randomUUID()];
      for (const [s, launch] of launches.entries()) {
        await submit(
          record({
            projectId,
            timestamp: `2026-01-01T00:00:0${s}.000Z`,
          }),
          {token, launch},
        ).expect(200);
      }
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 3);

      const seen: string[] = [];
      const totalCounts: unknown[] = [];
      let cursor: string | undefined;
      let first: string | undefined;
      do {
        const res = await get('client-instances', {
          clientName,
          limit: 2,
          ...(cursor ? {cursor} : {}),
        }).expect(200);
        seen.push(
          ...(res.body.data.items as ClientInstanceItem[]).map(
            i => i.clientInstanceId,
          ),
        );
        totalCounts.push(res.body.data.totalCount);
        cursor = res.body.data.nextCursor;
        first ??= cursor;
      } while (cursor);

      expect(seen).toEqual([...launches].reverse());
      expect(totalCounts).toEqual([launches.length, undefined]);
      await get('client-instances', {
        clientName: E2E_CLIENT_NAME,
        cursor: first as string,
      }).expect(400);
      await get('client-instances', {cursor: first as string}).expect(400);
    });
  });

  it('no longer serves GET /diagnostics/logs', async () => {
    const res = await get('diagnostics/logs', {
      clientInstanceId: randomUUID(),
    }).expect(404);
    expect(res.body.errorCode).toBe('NotFoundException');
  });

  describe('rejections', () => {
    it.each([
      ['the removed msg field', {msg: 'old'}],
      ['the removed serviceName field', {serviceName: 'ui'}],
      [
        'the removed serviceInstanceId field',
        {serviceInstanceId: randomUUID()},
      ],
      ['a clientName field', {clientName: 'spoofed'}],
      ['a clientInstanceId field', {clientInstanceId: randomUUID()}],
      ['an over-long eventName', {eventName: 'a'.repeat(257)}],
      ['a lowercase level', {level: 'info'}],
    ])('POST rejects %s with 400', async (_label, overrides) => {
      await submit(record(overrides)).expect(400);
    });

    it.each([
      [
        'missing',
        null,
        'ERR_1002',
        'X-ARC-Client-Instance-Id header is required',
      ],
      [
        'not a UUID',
        'ui-1',
        'ERR_1004',
        'X-ARC-Client-Instance-Id must be a UUID',
      ],
    ])(
      'POST rejects a launch header that is %s with 400',
      async (_label, launch, errorCode, message) => {
        const res = await submit(record(), {launch}).expect(400);

        expect(res.body).toMatchObject({statusCode: 400, errorCode, message});
      },
    );

    it.each([
      ['limit=0', {limit: 0}],
      ['limit above the maximum', {limit: 1001}],
      ['an unknown order', {order: 'up'}],
      ['an unknown origin', {origin: 'ui'}],
      ['an unknown minLevel', {minLevel: 'warning'}],
      ['a lowercase origin', {origin: 'client'}],
      ['a lowercase minLevel', {minLevel: 'warn'}],
      ['a non-UUID clientInstanceId', {clientInstanceId: 'x'}],
      ['the removed serviceName filter', {serviceName: 'ui'}],
      ['a malformed cursor', {cursor: 'garbage'}],
    ])('GET project logs rejects %s with 400', async (_label, query) => {
      await get(projectLogs(randomUUID()), query).expect(400);
    });

    it('GET rejects a malformed cursor with ERR_1004', async () => {
      const res = await get(projectLogs(randomUUID()), {
        cursor: 'garbage',
      }).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        errorCode: 'ERR_1004',
        message: 'Invalid log cursor: not a cursor returned by this API',
      });
    });

    it.each([
      ['limit=0', {limit: 0}],
      ['an order', {order: 'asc'}],
      ['a malformed cursor', {cursor: 'garbage'}],
    ])('GET client-instances rejects %s with 400', async (_label, query) => {
      await get('client-instances', query).expect(400);
    });

    it('GET rejects a cursor used with another order or filter', async () => {
      const projectId = randomUUID();
      for (let s = 0; s < 2; s++) {
        await submit(
          record({projectId, timestamp: `2026-01-01T00:00:0${s}.000Z`}),
        ).expect(200);
      }
      await waitForRows(projectLogs(projectId), {origin: 'CLIENT'}, 2);
      const first = await get(projectLogs(projectId), {
        origin: 'CLIENT',
        limit: 1,
      }).expect(200);
      const cursor = first.body.data.nextCursor as string;

      await get(projectLogs(projectId), {
        origin: 'CLIENT',
        limit: 1,
        order: 'asc',
        cursor,
      }).expect(400);
      await get(projectLogs(projectId), {limit: 1, cursor}).expect(400);
      await get(projectLogs(randomUUID()), {
        origin: 'CLIENT',
        limit: 1,
        cursor,
      }).expect(400);
      // The page size is not part of the cursor.
      await get(projectLogs(projectId), {
        origin: 'CLIENT',
        limit: 5,
        cursor,
      }).expect(200);
    });

    it('names the failed fields in a validation error', async () => {
      const res = await submit(record({msg: 'old', level: 'loud'})).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        errorCode: 'BadRequestException',
        path: '/arc-api/v1/logs',
      });
      expect(res.body.message).toContain('property msg should not exist');
      expect(res.body.message).toContain('level');
      expect(res.body.details).toEqual(
        expect.arrayContaining(['property msg should not exist']),
      );
    });

    it('rejects a body over the 100 KB limit with 413', async () => {
      const res = await submit(
        record({description: 'a'.repeat(200_000)}),
      ).expect(413);

      expect(res.body).toMatchObject({
        statusCode: 413,
        errorCode: 'PayloadTooLargeError',
      });
    });

    it('rejects malformed JSON with 400', async () => {
      await request(httpServer)
        .post('/arc-api/v1/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"level":')
        .timeout(10000)
        .expect(400);
    });
  });
});
