/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {LogEntrySchema} from '../entity-schema/log-entry.schema.js';
import {loggingMigrations} from '../migrations/logging-migration-index.js';
import type {DataSourceOptions} from 'typeorm';

export function getLoggingOrmBase(): Pick<
  DataSourceOptions,
  'entities' | 'migrations' | 'synchronize'
> {
  return {
    entities: [LogEntrySchema],
    migrations: loggingMigrations,
    synchronize: false,
  };
}
