/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource} from 'typeorm';
import {LogLevel} from '@arc/core';
import {
  DbLogQueryService,
  InvalidLogCursorError,
  LogEntrySchema,
  LogOrigin,
  LogSortOrder,
  getLoggingOrmBase,
} from '../../../src/index.js';
import type {
  LogEntryReadModel,
  LogEntryRow,
  ProjectLogSearchCriteria,
} from '../../../src/index.js';

const API = 'audioreach-creator-api';
const UI = 'audioreach-creator-ui';
const CLI = 'audioreach-cli';
const API_RUN = '11111111-1111-4111-8111-111111111111';
const LAUNCH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LAUNCH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LAUNCH_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Seed = Partial<Omit<LogEntryRow, 'id'>> & {at: string};

/** A record the client `clientName` wrote in launch `launch`. */
const byClient = (clientName: string, launch: string) => ({
  serviceName: clientName,
  serviceInstanceId: launch,
  clientName,
  clientInstanceId: launch,
});

/** A server record written while serving `clientName` launch `launch`. */
const forClient = (clientName: string, launch: string) => ({
  clientName,
  clientInstanceId: launch,
});

describe('DbLogQueryService', () => {
  let dataSource: DataSource;
  let service: DbLogQueryService;

  const insert = async (seed: Seed): Promise<number> => {
    const {at, ...row} = seed;
    const saved = await dataSource
      .getRepository<LogEntryRow>(LogEntrySchema)
      .save({
        level: LogLevel.Info,
        component: 'TestComponent',
        tag: 'test-tag',
        eventName: 'test.event',
        description: 'test description',
        serviceName: API,
        serviceInstanceId: API_RUN,
        ...row,
        timestamp: new Date(at),
      });
    return saved.id;
  };

  const ids = (items: LogEntryReadModel[]): number[] =>
    items.map(i => i.systemId);

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      ...getLoggingOrmBase(),
      migrationsRun: true,
    });
    await dataSource.initialize();
    service = new DbLogQueryService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM log_entries');
  });

  describe('searchProjectLogs', () => {
    const search = (
      criteria: Partial<ProjectLogSearchCriteria> & {projectId?: string} = {},
    ) =>
      service.searchProjectLogs({
        projectId: 'p1',
        limit: 200,
        order: LogSortOrder.Desc,
        ...criteria,
      });

    it('maps a client record to the read model', async () => {
      const id = await insert({
        at: '2026-01-01T00:00:00.000Z',
        level: LogLevel.Error,
        projectId: 'p1',
        eventName: 'project.open.failed',
        description: 'Could not open project Demo',
        error: '{"message":"boom"}',
        ...byClient(UI, LAUNCH_A),
      });

      expect(await search()).toEqual({
        items: [
          {
            systemId: id,
            level: LogLevel.Error,
            timestamp: '2026-01-01T00:00:00.000Z',
            eventName: 'project.open.failed',
            description: 'Could not open project Demo',
            component: 'TestComponent',
            tag: 'test-tag',
            origin: LogOrigin.Client,
            clientName: UI,
            clientInstanceId: LAUNCH_A,
            serverInstanceId: undefined,
            projectId: 'p1',
            error: '{"message":"boom"}',
          },
        ],
        totalCount: 1,
      });
    });

    it('maps a server record, with the API run as serverInstanceId', async () => {
      await insert({
        at: '2026-01-01T00:00:00.000Z',
        projectId: 'p1',
        ...forClient(UI, LAUNCH_A),
      });

      const [item] = (await search()).items;

      expect(item).toEqual(
        expect.objectContaining({
          origin: LogOrigin.Server,
          clientName: UI,
          clientInstanceId: LAUNCH_A,
          serverInstanceId: API_RUN,
        }),
      );
    });

    it('returns optional columns as undefined, not null', async () => {
      await insert({at: '2026-01-01T00:00:00.000Z', projectId: 'p1'});

      const [item] = (await search()).items;

      expect(item.origin).toBe(LogOrigin.Server);
      expect(item.error).toBeUndefined();
      expect(item.clientName).toBeUndefined();
      expect(item.clientInstanceId).toBeUndefined();
    });

    describe('filters', () => {
      it('returns only the project, excluding records without one', async () => {
        const inProject = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
        });
        await insert({at: '2026-01-01T00:00:02Z', projectId: 'p2'});
        await insert({at: '2026-01-01T00:00:03Z'});

        expect(ids((await search()).items)).toEqual([inProject]);
      });

      it('by clientName: records the client wrote and records for it', async () => {
        const own = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...byClient(UI, LAUNCH_A),
        });
        const forIt = await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_B),
        });
        await insert({
          at: '2026-01-01T00:00:03Z',
          projectId: 'p1',
          ...byClient(CLI, LAUNCH_C),
        });
        await insert({at: '2026-01-01T00:00:04Z', projectId: 'p1'});

        const page = await search({clientName: UI, order: LogSortOrder.Asc});

        expect(ids(page.items)).toEqual([own, forIt]);
      });

      it('by clientInstanceId: records the launch wrote and records for it', async () => {
        const own = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...byClient(UI, LAUNCH_A),
        });
        const forIt = await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_A),
        });
        await insert({
          at: '2026-01-01T00:00:03Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_B),
        });
        await insert({
          at: '2026-01-01T00:00:04Z',
          projectId: 'p2',
          ...forClient(UI, LAUNCH_A),
        });

        const page = await search({
          clientInstanceId: LAUNCH_A,
          order: LogSortOrder.Asc,
        });

        expect(ids(page.items)).toEqual([own, forIt]);
      });

      it('by clientName and clientInstanceId: only that client, when another reuses the launch ID', async () => {
        const own = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...byClient(UI, LAUNCH_A),
        });
        await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...byClient(CLI, LAUNCH_A),
        });

        const page = await search({clientName: UI, clientInstanceId: LAUNCH_A});

        expect(ids(page.items)).toEqual([own]);
      });

      it('by origin', async () => {
        const client = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...byClient(UI, LAUNCH_A),
        });
        const serverForClient = await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_A),
        });
        const serverAlone = await insert({
          at: '2026-01-01T00:00:03Z',
          projectId: 'p1',
        });

        const asc = {order: LogSortOrder.Asc};
        expect(
          ids((await search({...asc, origin: LogOrigin.Client})).items),
        ).toEqual([client]);
        expect(
          ids((await search({...asc, origin: LogOrigin.Server})).items),
        ).toEqual([serverForClient, serverAlone]);
        expect(ids((await search(asc)).items)).toEqual([
          client,
          serverForClient,
          serverAlone,
        ]);
      });

      it('by minLevel: that level and every more severe one', async () => {
        const levels = [
          LogLevel.Verbose,
          LogLevel.Debug,
          LogLevel.Info,
          LogLevel.Warn,
          LogLevel.Error,
          LogLevel.Critical,
        ];
        const byLevel = new Map<LogLevel, number>();
        for (const [i, level] of levels.entries()) {
          byLevel.set(
            level,
            await insert({
              at: `2026-01-01T00:00:0${i}Z`,
              projectId: 'p1',
              level,
            }),
          );
        }
        const idsOf = (...wanted: LogLevel[]) =>
          wanted.map(level => byLevel.get(level));
        const asc = {order: LogSortOrder.Asc};

        expect(
          ids((await search({...asc, minLevel: LogLevel.Warn})).items),
        ).toEqual(idsOf(LogLevel.Warn, LogLevel.Error, LogLevel.Critical));
        expect(
          ids((await search({...asc, minLevel: LogLevel.Critical})).items),
        ).toEqual(idsOf(LogLevel.Critical));
        expect(
          ids((await search({...asc, minLevel: LogLevel.Verbose})).items),
        ).toEqual(idsOf(...levels));
      });

      it('applies all filters together; disagreeing filters match nothing', async () => {
        await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...byClient(UI, LAUNCH_A),
        });
        const match = await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_A),
        });

        expect(
          ids(
            (
              await search({
                clientName: UI,
                clientInstanceId: LAUNCH_A,
                origin: LogOrigin.Server,
              })
            ).items,
          ),
        ).toEqual([match]);
        expect(
          (await search({clientName: CLI, clientInstanceId: LAUNCH_A})).items,
        ).toEqual([]);
      });
    });

    describe('order', () => {
      it('sorts newest first for desc and oldest first for asc', async () => {
        const older = await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
        });
        const newer = await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
        });
        // Inserted last but produced first: order follows timestamp, not id.
        const oldest = await insert({
          at: '2026-01-01T00:00:00Z',
          projectId: 'p1',
        });

        expect(ids((await search()).items)).toEqual([newer, older, oldest]);
        expect(ids((await search({order: LogSortOrder.Asc})).items)).toEqual([
          oldest,
          older,
          newer,
        ]);
      });

      it('breaks timestamp ties by systemId in the same direction', async () => {
        const first = await insert({
          at: '2026-01-01T00:00:00Z',
          projectId: 'p1',
        });
        const second = await insert({
          at: '2026-01-01T00:00:00Z',
          projectId: 'p1',
        });

        expect(ids((await search()).items)).toEqual([second, first]);
        expect(ids((await search({order: LogSortOrder.Asc})).items)).toEqual([
          first,
          second,
        ]);
      });
    });

    describe('pagination', () => {
      // Five records; two share a timestamp so a page boundary falls on a tie.
      const seedFive = async (): Promise<number[]> => [
        await insert({at: '2026-01-01T00:00:01.000Z', projectId: 'p1'}),
        await insert({at: '2026-01-01T00:00:02.000Z', projectId: 'p1'}),
        await insert({at: '2026-01-01T00:00:02.000Z', projectId: 'p1'}),
        await insert({at: '2026-01-01T00:00:03.500Z', projectId: 'p1'}),
        await insert({at: '2026-01-01T00:00:04.000Z', projectId: 'p1'}),
      ];

      const readAll = async (order: LogSortOrder): Promise<number[][]> => {
        const pages: number[][] = [];
        let cursor: string | undefined;
        do {
          const page = await search({limit: 2, order, cursor});
          pages.push(ids(page.items));
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        return pages;
      };

      it('pages newest first without skipping or repeating rows', async () => {
        const [a, b, c, d, e] = await seedFive();

        expect(await readAll(LogSortOrder.Desc)).toEqual([[e, d], [c, b], [a]]);
      });

      it('pages oldest first without skipping or repeating rows', async () => {
        const [a, b, c, d, e] = await seedFive();

        expect(await readAll(LogSortOrder.Asc)).toEqual([[a, b], [c, d], [e]]);
      });

      it('omits nextCursor when the last page is exactly full', async () => {
        await insert({at: '2026-01-01T00:00:01Z', projectId: 'p1'});
        await insert({at: '2026-01-01T00:00:02Z', projectId: 'p1'});

        const page = await search({limit: 2});

        expect(page.items).toHaveLength(2);
        expect(page.nextCursor).toBeUndefined();
      });

      it('does not shift pages when newer records arrive while paging desc', async () => {
        const [, b, c, d, e] = await seedFive();
        const first = await search({limit: 2});
        await insert({at: '2026-01-01T00:00:09Z', projectId: 'p1'});

        const second = await search({limit: 2, cursor: first.nextCursor});

        expect(ids(first.items)).toEqual([e, d]);
        expect(ids(second.items)).toEqual([c, b]);
      });

      it('accepts a different page size with the same cursor', async () => {
        const [a, b, c] = await seedFive();
        const first = await search({limit: 2});

        const rest = await search({limit: 10, cursor: first.nextCursor});

        expect(ids(rest.items)).toEqual([c, b, a]);
      });

      it('caps the limit at the maximum for direct callers', async () => {
        await insert({at: '2026-01-01T00:00:01Z', projectId: 'p1'});

        const page = await search({limit: 1_000_000});

        expect(page.items).toHaveLength(1);
      });

      it('returns totalCount on the first page only', async () => {
        await seedFive();
        const first = await search({limit: 2});
        const second = await search({limit: 2, cursor: first.nextCursor});

        expect(first.totalCount).toBe(5);
        expect(second).not.toHaveProperty('totalCount');
      });

      it('returns totalCount 0 when nothing matches', async () => {
        expect(await search()).toEqual({items: [], totalCount: 0});
      });

      it('counts with the same filters as the page', async () => {
        await insert({at: '2026-01-01T00:00:01Z', projectId: 'p1'});
        await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          level: LogLevel.Error,
          ...forClient(UI, LAUNCH_A),
        });
        await insert({
          at: '2026-01-01T00:00:03Z',
          projectId: 'p1',
          level: LogLevel.Error,
          ...byClient(UI, LAUNCH_A),
        });
        await insert({
          at: '2026-01-01T00:00:04Z',
          projectId: 'p2',
          ...byClient(UI, LAUNCH_A),
        });
        await insert({at: '2026-01-01T00:00:05Z'});

        const count = async (criteria: Partial<ProjectLogSearchCriteria>) =>
          (await search({limit: 1, ...criteria})).totalCount;

        expect(await count({})).toBe(3);
        expect(await count({clientName: UI})).toBe(2);
        expect(await count({clientInstanceId: LAUNCH_A})).toBe(2);
        expect(await count({origin: LogOrigin.Client})).toBe(1);
        expect(await count({minLevel: LogLevel.Error})).toBe(2);
        expect(await count({order: LogSortOrder.Asc})).toBe(3);
        expect(
          await count({origin: LogOrigin.Server, minLevel: LogLevel.Error}),
        ).toBe(1);
      });

      it('matches the records a desc download returns when newer ones arrive during it', async () => {
        await seedFive();
        const first = await search({limit: 2});
        let returned = first.items.length;
        let cursor = first.nextCursor;
        await insert({at: '2026-01-01T00:00:09Z', projectId: 'p1'});
        while (cursor !== undefined) {
          const page = await search({limit: 2, cursor});
          returned += page.items.length;
          cursor = page.nextCursor;
        }

        expect(returned).toBe(first.totalCount);
      });

      it.each<[string, Partial<ProjectLogSearchCriteria>]>([
        ['order', {order: LogSortOrder.Asc}],
        ['projectId', {projectId: 'p2'}],
        ['clientName', {clientName: UI}],
        ['clientInstanceId', {clientInstanceId: LAUNCH_A}],
        ['origin', {origin: LogOrigin.Server}],
        ['minLevel', {minLevel: LogLevel.Info}],
      ])('rejects a cursor used with a different %s', async (_name, change) => {
        await seedFive();
        const first = await search({limit: 2});

        await expect(
          search({limit: 2, ...change, cursor: first.nextCursor}),
        ).rejects.toThrow(InvalidLogCursorError);
      });

      it('rejects a malformed cursor', async () => {
        await expect(search({cursor: 'garbage'})).rejects.toThrow(
          InvalidLogCursorError,
        );
      });

      it('rejects a client-instances cursor', async () => {
        await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_A),
        });
        await insert({
          at: '2026-01-01T00:00:02Z',
          projectId: 'p1',
          ...forClient(UI, LAUNCH_B),
        });
        const launches = await service.listClientInstances({limit: 1});

        await expect(search({cursor: launches.nextCursor})).rejects.toThrow(
          InvalidLogCursorError,
        );
      });
    });
  });

  describe('listClientInstances', () => {
    const list = (
      criteria: {clientName?: string; limit?: number; cursor?: string} = {},
    ) => service.listClientInstances({limit: 200, ...criteria});

    it('summarizes each launch from its project records', async () => {
      await insert({
        at: '2026-01-01T00:00:01Z',
        projectId: 'p2',
        ...byClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:02Z',
        projectId: 'p1',
        level: LogLevel.Error,
        ...forClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:03.250Z',
        projectId: 'p2',
        level: LogLevel.Critical,
        ...byClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:04Z',
        projectId: 'p1',
        level: LogLevel.Warn,
        ...forClient(UI, LAUNCH_A),
      });
      // Not readable through the API, so not counted.
      await insert({at: '2026-01-01T00:00:09Z', ...forClient(UI, LAUNCH_A)});

      expect(await list()).toEqual({
        items: [
          {
            clientName: UI,
            clientInstanceId: LAUNCH_A,
            projectIds: ['p1', 'p2'],
            firstTimestamp: '2026-01-01T00:00:01.000Z',
            lastTimestamp: '2026-01-01T00:00:04.000Z',
            recordCount: 4,
            errorCount: 2,
          },
        ],
        totalCount: 1,
      });
    });

    it('omits launches with no project records and records with no client', async () => {
      await insert({at: '2026-01-01T00:00:01Z', ...forClient(UI, LAUNCH_A)});
      await insert({at: '2026-01-01T00:00:02Z', projectId: 'p1'});

      expect((await list()).items).toEqual([]);
    });

    it('sorts by lastTimestamp, newest first, and filters by clientName', async () => {
      await insert({
        at: '2026-01-01T00:00:03Z',
        projectId: 'p1',
        ...byClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:05Z',
        projectId: 'p1',
        ...byClient(CLI, LAUNCH_B),
      });
      await insert({
        at: '2026-01-01T00:00:01Z',
        projectId: 'p1',
        ...forClient(UI, LAUNCH_C),
      });

      const launches = (page: {items: {clientInstanceId: string}[]}) =>
        page.items.map(i => i.clientInstanceId);

      expect(launches(await list())).toEqual([LAUNCH_B, LAUNCH_A, LAUNCH_C]);
      expect(launches(await list({clientName: UI}))).toEqual([
        LAUNCH_A,
        LAUNCH_C,
      ]);
    });

    it('pages without skipping or repeating launches, across a timestamp tie', async () => {
      for (const launch of [LAUNCH_A, LAUNCH_B, LAUNCH_C]) {
        await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...forClient(UI, launch),
        });
      }
      const pages: string[][] = [];
      let cursor: string | undefined;
      do {
        const page = await list({limit: 2, cursor});
        pages.push(page.items.map(i => i.clientInstanceId));
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      expect(pages).toEqual([[LAUNCH_C, LAUNCH_B], [LAUNCH_A]]);
    });

    it('lists two clients that send the same launch ID as separate launches', async () => {
      await insert({
        at: '2026-01-01T00:00:01Z',
        projectId: 'p1',
        level: LogLevel.Error,
        ...byClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:02Z',
        projectId: 'p2',
        ...byClient(CLI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:03Z',
        projectId: 'p2',
        ...byClient(CLI, LAUNCH_A),
      });

      expect((await list()).items).toEqual([
        {
          clientName: CLI,
          clientInstanceId: LAUNCH_A,
          projectIds: ['p2'],
          firstTimestamp: '2026-01-01T00:00:02.000Z',
          lastTimestamp: '2026-01-01T00:00:03.000Z',
          recordCount: 2,
          errorCount: 0,
        },
        {
          clientName: UI,
          clientInstanceId: LAUNCH_A,
          projectIds: ['p1'],
          firstTimestamp: '2026-01-01T00:00:01.000Z',
          lastTimestamp: '2026-01-01T00:00:01.000Z',
          recordCount: 1,
          errorCount: 1,
        },
      ]);
    });

    it('lists records without a client name as their own launch', async () => {
      await insert({
        at: '2026-01-01T00:00:01Z',
        projectId: 'p1',
        ...byClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:02Z',
        projectId: 'p1',
        clientInstanceId: LAUNCH_A,
      });

      const page = await list();

      expect(page.items.map(i => [i.clientName, i.recordCount])).toEqual([
        [undefined, 1],
        [UI, 1],
      ]);
    });

    it('pages across a timestamp tie between clients sharing a launch ID', async () => {
      for (const clientName of [UI, CLI, API]) {
        await insert({
          at: '2026-01-01T00:00:01Z',
          projectId: 'p1',
          ...forClient(clientName, LAUNCH_A),
        });
      }
      const pages: (string | undefined)[][] = [];
      let cursor: string | undefined;
      do {
        const page = await list({limit: 1, cursor});
        pages.push(page.items.map(i => i.clientName));
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      expect(pages).toEqual([[UI], [API], [CLI]]);
    });

    it('returns totalCount of launches on the first page only, with the filter', async () => {
      for (const [clientName, launch] of [
        [UI, LAUNCH_A],
        [UI, LAUNCH_B],
        [CLI, LAUNCH_A],
      ] as const) {
        // Two records each: launches are counted, not records.
        for (const at of ['2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z']) {
          await insert({at, projectId: 'p1', ...forClient(clientName, launch)});
        }
      }
      // A launch without a client name is a launch row too.
      await insert({
        at: '2026-01-01T00:00:03Z',
        projectId: 'p1',
        clientInstanceId: LAUNCH_C,
      });
      // Not listed, so not counted.
      await insert({at: '2026-01-01T00:00:04Z', ...forClient(UI, LAUNCH_C)});

      const first = await list({limit: 1});
      const second = await list({limit: 1, cursor: first.nextCursor});

      expect(first.totalCount).toBe(4);
      expect(second).not.toHaveProperty('totalCount');
      expect((await list({clientName: UI})).totalCount).toBe(2);
      expect((await list({clientName: 'nobody'})).totalCount).toBe(0);
    });

    it('rejects a cursor used with a different clientName', async () => {
      await insert({
        at: '2026-01-01T00:00:01Z',
        projectId: 'p1',
        ...forClient(UI, LAUNCH_A),
      });
      await insert({
        at: '2026-01-01T00:00:02Z',
        projectId: 'p1',
        ...forClient(UI, LAUNCH_B),
      });
      const first = await list({limit: 1});

      await expect(
        list({limit: 1, clientName: UI, cursor: first.nextCursor}),
      ).rejects.toThrow(InvalidLogCursorError);
    });
  });
});
