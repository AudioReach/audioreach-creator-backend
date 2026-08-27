/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';

export const RESTORE_TYPE = {
  EditSnapshot: 'EDIT_SNAPSHOT',
  FullSnapshot: 'FULL_SNAPSHOT',
} as const;

export type RestoreType = (typeof RESTORE_TYPE)[keyof typeof RESTORE_TYPE];

export interface RestorePointRow {
  systemId: number;
  sessionId: number | null;
  fileSystemId: number;
  restoreType: RestoreType;
  snapshotData: string; // json
  description: string | null;
  createdAt: Date;
  file?: ArcDbFileRow;
}

export const RestorePointSchema = new EntitySchema<RestorePointRow>({
  name: 'RestorePoint',
  tableName: 'restore_points',
  columns: {
    systemId: {
      name: 'system_id',
      type: 'integer',
      primary: true,
      generated: 'increment',
    },
    sessionId: {
      name: 'session_id',
      type: 'integer',
      nullable: true,
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    restoreType: {
      name: 'restore_type',
      type: 'simple-enum',
      enum: Object.values(RESTORE_TYPE),
    },
    snapshotData: {
      name: 'snapshot_data',
      type: 'text',
      nullable: false,
    },
    description: {
      name: 'description',
      type: 'text',
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'datetime',
      createDate: true,
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_restore_points_session',
      columns: ['sessionId'],
    },
    {
      name: 'idx_restore_points_file',
      columns: ['fileSystemId'],
    },
  ],
});
