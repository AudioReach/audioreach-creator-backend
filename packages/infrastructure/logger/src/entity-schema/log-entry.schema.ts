/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {LogLevel} from '@arc/core';

export interface LogEntryRow {
  /** Database-generated log entry identifier */
  id: number;
  /** Severity of the log entry */
  level: LogLevel;
  /** When the record was produced */
  timestamp: Date;
  /** Project or workspace associated with the log entry */
  projectId?: string;
  /** Component, service, or module that emitted the log entry */
  component: string;
  /** Feature or category used to group log entries */
  tag: string;
  /** Stable event identifier used for grouping related log entries */
  eventName: string;
  /** Detailed, contextual description of the logged event */
  description: string;
  /** Serialized error details when the entry represents a failure */
  error?: string;
  /** Service that wrote the record (OpenTelemetry `service.name`) */
  serviceName: string;
  /** Instance of that service (OpenTelemetry `service.instance.id`) */
  serviceInstanceId: string;
  /**
   * Client the record belongs to: the client that wrote it, or the client a
   * server record was written for
   */
  clientName?: string;
  /**
   * Client launch the record belongs to, by the same rule. A client record
   * has `clientInstanceId === serviceInstanceId`; that is how the query
   * service tells client records from server records.
   */
  clientInstanceId?: string;
}

export const LogEntrySchema = new EntitySchema<LogEntryRow>({
  name: 'LogEntry',
  tableName: 'log_entries',
  columns: {
    id: {type: 'integer', primary: true, generated: 'increment'},
    level: {name: 'level', type: 'text', nullable: false},
    timestamp: {name: 'timestamp', type: 'datetime', nullable: false},
    projectId: {name: 'project_id', type: 'text', nullable: true},
    component: {name: 'component', type: 'text', nullable: false},
    tag: {name: 'tag', type: 'text', nullable: false},
    eventName: {name: 'event_name', type: 'text', nullable: false},
    description: {name: 'description', type: 'text', nullable: false},
    error: {name: 'error', type: 'text', nullable: true},
    serviceName: {name: 'service_name', type: 'text', nullable: false},
    serviceInstanceId: {
      name: 'service_instance_id',
      type: 'text',
      nullable: false,
    },
    clientName: {name: 'client_name', type: 'text', nullable: true},
    clientInstanceId: {
      name: 'client_instance_id',
      type: 'text',
      nullable: true,
    },
  },
  indices: [
    {
      name: 'idx_log_entries_project_timestamp',
      columns: ['projectId', 'timestamp'],
    },
    {
      name: 'idx_log_entries_client_instance_project',
      columns: ['clientInstanceId', 'projectId'],
    },
  ],
});
