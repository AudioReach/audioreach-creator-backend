/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';

export const SESSION_MODE = {
  Tuning: 'TUNING',
  Designer: 'DESIGNER',
  DiscoveryWizard: 'DISCOVERY_WIZARD',
  DiffMerge: 'DIFF_MERGE',
  ReadOnly: 'READONLY',
  Simulation: 'SIMULATION',
  Connected: 'CONNECTED',
  Disconnected: 'DISCONNECTED',
} as const;
export type SessionMode = (typeof SESSION_MODE)[keyof typeof SESSION_MODE];

export const SESSION_STATUS = {
  Active: 'ACTIVE',
  Ended: 'ENDED',
} as const;
export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export interface ProjectSessionRow {
  sessionId: number;
  fileSystemId: number;
  userId: string | null;
  sessionMode: SessionMode;
  status: SessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  file?: ArcDbFileRow;
}

export const ProjectSessionSchema = new EntitySchema<ProjectSessionRow>({
  name: 'ProjectSession',
  tableName: 'project_sessions',
  columns: {
    sessionId: {
      name: 'session_id',
      type: 'integer',
      primary: true,
      generated: 'increment',
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    userId: {
      name: 'user_id',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    sessionMode: {
      name: 'session_mode',
      type: 'simple-enum',
      enum: Object.values(SESSION_MODE),
      nullable: false,
    },
    status: {
      name: 'status',
      type: 'simple-enum',
      enum: Object.values(SESSION_STATUS),
      default: SESSION_STATUS.Active,
      nullable: false,
    },
    startedAt: {
      name: 'started_at',
      type: 'datetime',
      createDate: true,
    },
    endedAt: {
      name: 'ended_at',
      type: 'datetime',
      nullable: true,
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_project_sessions_file',
      columns: ['fileSystemId'],
    },
    {
      name: 'idx_project_sessions_status',
      columns: ['status'],
    },
    {
      name: 'uq_project_sessions_one_active_per_file',
      columns: ['fileSystemId'],
      unique: true,
      where: `status = 'ACTIVE'`,
    },
  ],
});
