/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {LogQueryService, LogEntryReadModel} from '@arc/core';
import {LogEntrySchema} from '../entity-schema/log-entry.schema.js';
import type {LogEntryRow} from '../entity-schema/log-entry.schema.js';

const LOG_ENTRY_ENTITY = LogEntrySchema.options.name;

export class DbLogQueryService implements LogQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getLogsByProject(
    projectId: string,
    clientId: string,
  ): Promise<LogEntryReadModel[]> {
    const rows = await this.dataSource
      .getRepository<LogEntryRow>(LOG_ENTRY_ENTITY)
      .createQueryBuilder('l')
      .where('l.source = :clientId', {clientId})
      .andWhere('(l.projectId = :projectId OR l.projectId IS NULL)', {
        projectId,
      })
      .orderBy('l.timestamp', 'DESC')
      .getMany();

    return rows.map(row => ({
      ...row,
      timestamp: row.timestamp.toISOString(),
      projectId: row.projectId ?? undefined,
      error: row.error ?? undefined,
    })) as LogEntryReadModel[];
  }
}
