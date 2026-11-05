/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Brackets} from 'typeorm';
import type {DataSource, SelectQueryBuilder} from 'typeorm';
import {LogLevel} from '@arc/core';
import {LogOrigin} from './log-entry-read-model.js';
import type {LogEntryReadModel} from './log-entry-read-model.js';
import type {ClientInstanceReadModel} from './client-instance-read-model.js';
import {LOG_SEARCH_MAX_LIMIT, LogSortOrder} from './log-search-criteria.js';
import type {
  ClientInstancePage,
  ClientInstanceSearchCriteria,
  LogSearchPage,
  ProjectLogSearchCriteria,
} from './log-search-criteria.js';
import type {LogQueryService} from './log-query-service.js';
import {logLevelsAtOrAbove} from './log-level-order.js';
import {LogEntrySchema} from '../entity-schema/log-entry.schema.js';
import type {LogEntryRow} from '../entity-schema/log-entry.schema.js';
import {
  decodeLogCursor,
  encodeLogCursor,
  isClientInstanceKey,
  isSystemId,
} from './log-cursor.js';
import type {LogCursorScope} from './log-cursor.js';
import {compareCodeUnits} from './compare-code-units.js';

const LOG_ENTRY_ENTITY = LogEntrySchema.options.name;

/** A client record is produced by the launch it belongs to. */
const IS_CLIENT_RECORD = 'l.clientInstanceId = l.serviceInstanceId';
const IS_SERVER_RECORD =
  '(l.clientInstanceId IS NULL OR l.clientInstanceId <> l.serviceInstanceId)';

/**
 * A launch is identified by the verified client name together with the launch
 * ID, which the client reports itself. Keying on both keeps a client that
 * sends another client's launch ID out of that launch. Records without a
 * client name (requests without a valid token) form their own launch row.
 */
const LAUNCH_NAME_KEY = "COALESCE(l.clientName, '')";

/** One value per launch row, for counting launches without grouping. */
const LAUNCH_KEY = `json_array(${LAUNCH_NAME_KEY}, l.clientInstanceId)`;

interface ClientInstanceRow {
  clientInstanceId: string;
  clientName: string | null;
  projectIds: string;
  firstTimestamp: string;
  lastTimestamp: string;
  recordCount: number | string;
  errorCount: number | string;
}

export class DbLogQueryService implements LogQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async searchProjectLogs(
    criteria: ProjectLogSearchCriteria,
  ): Promise<LogSearchPage> {
    const limit = clampLimit(criteria.limit);
    const descending = criteria.order === LogSortOrder.Desc;
    const direction = descending ? 'DESC' : 'ASC';
    const scope: LogCursorScope = {
      listing: 'project-logs',
      options: {
        projectId: criteria.projectId,
        clientName: criteria.clientName,
        clientInstanceId: criteria.clientInstanceId,
        origin: criteria.origin,
        minLevel: criteria.minLevel,
        order: criteria.order,
      },
    };

    const qb = this.logEntries().where('l.projectId = :projectId', {
      projectId: criteria.projectId,
    });
    if (criteria.clientName !== undefined) {
      qb.andWhere('l.clientName = :clientName', {
        clientName: criteria.clientName,
      });
    }
    if (criteria.clientInstanceId !== undefined) {
      qb.andWhere('l.clientInstanceId = :clientInstanceId', {
        clientInstanceId: criteria.clientInstanceId,
      });
    }
    if (criteria.origin !== undefined) {
      qb.andWhere(
        criteria.origin === LogOrigin.Client
          ? IS_CLIENT_RECORD
          : IS_SERVER_RECORD,
      );
    }
    if (criteria.minLevel !== undefined) {
      qb.andWhere('l.level IN (:...levels)', {
        levels: logLevelsAtOrAbove(criteria.minLevel),
      });
    }
    // Counted before the cursor condition is added: the filter, not the page.
    const totalCount =
      criteria.cursor === undefined ? await qb.clone().getCount() : undefined;

    if (criteria.cursor !== undefined) {
      // Keyset: rows strictly after the last row of the previous page.
      const cursor = decodeLogCursor(criteria.cursor, scope, isSystemId);
      const cmp = descending ? '<' : '>';
      qb.andWhere(
        new Brackets(w => {
          w.where(`l.timestamp ${cmp} :cursorTimestamp`).orWhere(
            new Brackets(tie => {
              tie
                .where('l.timestamp = :cursorTimestamp')
                .andWhere(`l.id ${cmp} :cursorId`);
            }),
          );
        }),
        {
          // TypeORM writes Date parameters in the same format it stores.
          cursorTimestamp: new Date(cursor.timestamp),
          cursorId: cursor.key,
        },
      );
    }

    const rows = await qb
      .orderBy('l.timestamp', direction)
      .addOrderBy('l.id', direction)
      .limit(limit + 1)
      .getMany();

    const items = rows.slice(0, limit).map(row => toLogEntryReadModel(row));
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > limit && last !== undefined
        ? {
            nextCursor: encodeLogCursor(scope, {
              timestamp: last.timestamp,
              key: last.systemId,
            }),
          }
        : {}),
      ...(totalCount === undefined ? {} : {totalCount}),
    };
  }

  async listClientInstances(
    criteria: ClientInstanceSearchCriteria,
  ): Promise<ClientInstancePage> {
    const limit = clampLimit(criteria.limit);
    const scope: LogCursorScope = {
      listing: 'client-instances',
      options: {clientName: criteria.clientName},
    };

    // Records without a project cannot be read through the API, so they
    // neither list a launch nor count towards it.
    const launchRecords = this.logEntries()
      .where('l.clientInstanceId IS NOT NULL')
      .andWhere('l.projectId IS NOT NULL');
    if (criteria.clientName !== undefined) {
      launchRecords.andWhere('l.clientName = :clientName', {
        clientName: criteria.clientName,
      });
    }

    const totalCount =
      criteria.cursor === undefined
        ? await launchRecords
            .clone()
            .select(`COUNT(DISTINCT ${LAUNCH_KEY})`, 'count')
            .getRawOne<{count: number | string}>()
            .then(row => Number(row?.count ?? 0))
        : undefined;

    const qb = launchRecords
      .select('l.clientInstanceId', 'clientInstanceId')
      .addSelect('MAX(l.clientName)', 'clientName')
      .addSelect('json_group_array(DISTINCT l.projectId)', 'projectIds')
      .addSelect('MIN(l.timestamp)', 'firstTimestamp')
      .addSelect('MAX(l.timestamp)', 'lastTimestamp')
      .addSelect('COUNT(*)', 'recordCount')
      .addSelect(
        'SUM(CASE WHEN l.level IN (:...errorLevels) THEN 1 ELSE 0 END)',
        'errorCount',
      )
      .setParameter('errorLevels', [LogLevel.Error, LogLevel.Critical])
      .groupBy(LAUNCH_NAME_KEY)
      .addGroupBy('l.clientInstanceId');
    if (criteria.cursor !== undefined) {
      const cursor = decodeLogCursor(
        criteria.cursor,
        scope,
        isClientInstanceKey,
      );
      const [cursorName, cursorInstanceId] = cursor.key;
      qb.having(
        '(MAX(l.timestamp) < :cursorTimestamp OR ' +
          '(MAX(l.timestamp) = :cursorTimestamp AND ' +
          `(${LAUNCH_NAME_KEY}, l.clientInstanceId) < (:cursorName, :cursorInstanceId)))`,
        {
          cursorTimestamp: new Date(cursor.timestamp),
          cursorName,
          cursorInstanceId,
        },
      );
    }

    const rows = await qb
      .orderBy('MAX(l.timestamp)', 'DESC')
      .addOrderBy(LAUNCH_NAME_KEY, 'DESC')
      .addOrderBy('l.clientInstanceId', 'DESC')
      .limit(limit + 1)
      .getRawMany<ClientInstanceRow>();

    const items = rows
      .slice(0, limit)
      .map(row => toClientInstanceReadModel(row));
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > limit && last !== undefined
        ? {
            nextCursor: encodeLogCursor(scope, {
              timestamp: last.lastTimestamp,
              key: [last.clientName ?? '', last.clientInstanceId],
            }),
          }
        : {}),
      ...(totalCount === undefined ? {} : {totalCount}),
    };
  }

  private logEntries(): SelectQueryBuilder<LogEntryRow> {
    return this.dataSource
      .getRepository<LogEntryRow>(LOG_ENTRY_ENTITY)
      .createQueryBuilder('l');
  }
}

/** The API validates the range; this guards other callers. */
function clampLimit(limit: number): number {
  return Math.min(Math.max(1, limit), LOG_SEARCH_MAX_LIMIT);
}

function toLogEntryReadModel(row: LogEntryRow): LogEntryReadModel {
  const origin =
    row.clientInstanceId === row.serviceInstanceId
      ? LogOrigin.Client
      : LogOrigin.Server;
  return {
    systemId: row.id,
    level: row.level,
    timestamp: row.timestamp.toISOString(),
    eventName: row.eventName,
    description: row.description,
    component: row.component,
    tag: row.tag,
    origin,
    clientName: row.clientName ?? undefined,
    clientInstanceId: row.clientInstanceId ?? undefined,
    serverInstanceId:
      origin === LogOrigin.Server ? row.serviceInstanceId : undefined,
    projectId: row.projectId ?? undefined,
    error: row.error ?? undefined,
  };
}

function toClientInstanceReadModel(
  row: ClientInstanceRow,
): ClientInstanceReadModel {
  const projectIds = (JSON.parse(row.projectIds) as string[]).sort(
    compareCodeUnits,
  );
  return {
    clientName: row.clientName ?? undefined,
    clientInstanceId: row.clientInstanceId,
    projectIds,
    firstTimestamp: fromStoredDatetime(row.firstTimestamp),
    lastTimestamp: fromStoredDatetime(row.lastTimestamp),
    recordCount: Number(row.recordCount),
    errorCount: Number(row.errorCount),
  };
}

/**
 * Raw aggregates return the stored text, which TypeORM writes for SQLite as
 * UTC `YYYY-MM-DD HH:mm:ss.SSS`.
 */
function fromStoredDatetime(value: string): string {
  return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
}
