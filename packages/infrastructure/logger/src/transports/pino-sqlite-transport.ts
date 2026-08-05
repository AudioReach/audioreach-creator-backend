/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Transform} from 'node:stream';
import type {DataSource} from 'typeorm';
import {LogLevel, LogSource} from '@arc/core';
import {LogEntrySchema} from '../entity-schema/log-entry.schema.js';
import type {LogEntryRow} from '../entity-schema/log-entry.schema.js';

export class PinoSQLiteTransport extends Transform {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  _transform(chunk: unknown, _encoding: string, callback: () => void): void {
    // Node.js Transform streams require calling a callback inside async code.
    // The promise is fully handled: rejection is caught, callback is always called.
    // eslint-disable-next-line promise/catch-or-return, promise/no-callback-in-promise
    this.insertEntry(chunk).then(callback, (error: unknown) => {
      console.error('PinoSQLiteTransport unhandled error:', error);
      // eslint-disable-next-line promise/no-callback-in-promise
      callback();
    });
  }

  private async insertEntry(chunk: unknown): Promise<void> {
    let entry: Record<string, unknown>;
    try {
      // Pino writes one JSON object per chunk (NDJSON) — single-line JSON is guaranteed.
      const raw = (chunk as Buffer).toString();
      entry = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.error('PinoSQLiteTransport parse error:', error);
      return;
    }

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into<LogEntryRow>(LogEntrySchema.options.name)
      .values({
        level: (entry['level'] as LogLevel) ?? LogLevel.Info,
        timestamp:
          entry['timestamp'] != null
            ? new Date(entry['timestamp'] as string)
            : new Date(),
        source: (entry['source'] as string) ?? LogSource.Server,
        projectId: (entry['projectId'] as string) ?? undefined,
        component: (entry['component'] as string) ?? '',
        tag: (entry['tag'] as string) ?? '',
        msg: (entry['msg'] as string) ?? '',
        description: (entry['description'] as string) ?? '',
        error: entry['error'] ? JSON.stringify(entry['error']) : undefined,
      })
      .execute();
  }

  _flush(callback: () => void): void {
    callback();
  }
}
