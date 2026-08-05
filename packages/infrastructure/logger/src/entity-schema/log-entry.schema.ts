/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {LogLevel} from '@arc/core';

export interface LogEntryRow {
  id: number;
  level: LogLevel;
  timestamp: Date;
  source: string;
  projectId?: string;
  component: string;
  tag: string;
  msg: string;
  description: string;
  error?: string;
}

export const LogEntrySchema = new EntitySchema<LogEntryRow>({
  name: 'LogEntry',
  tableName: 'log_entries',
  columns: {
    id: {type: 'integer', primary: true, generated: 'increment'},
    level: {name: 'level', type: 'text', nullable: false},
    timestamp: {name: 'timestamp', type: 'datetime', nullable: false},
    source: {name: 'source', type: 'text', nullable: false},
    projectId: {name: 'project_id', type: 'text', nullable: true},
    component: {name: 'component', type: 'text', nullable: false},
    tag: {name: 'tag', type: 'text', nullable: false},
    msg: {name: 'msg', type: 'text', nullable: false},
    description: {name: 'description', type: 'text', nullable: false},
    error: {name: 'error', type: 'text', nullable: true},
  },
  indices: [
    {
      name: 'idx_log_entries_source_project_timestamp',
      columns: ['source', 'projectId', 'timestamp'],
    },
  ],
});
