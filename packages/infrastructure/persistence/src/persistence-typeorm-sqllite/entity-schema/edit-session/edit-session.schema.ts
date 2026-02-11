/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';

export const EDIT_STATUS = {
  ACTIVE: 'ACTIVE',
  COMMITTED: 'COMMITTED',
} as const;

export type EditStatus = (typeof EDIT_STATUS)[keyof typeof EDIT_STATUS];

export interface EditSessionRow {
  sessionId: string;
  userId: string | null;
  clientId: string;
  fileSystemId: number;
  modeId: string;
  editStatus: EditStatus;
  committedAt: Date | null;
  commitMessage: string | null;
  createdAt: Date;
}

export const EditSessionSchema = new EntitySchema<EditSessionRow>({
  name: 'EditSession',
  tableName: 'edit_sessions',
  columns: {
    sessionId: {
      name: 'session_id',
      type: 'varchar',
      length: 36,
      primary: true,
    },
    userId: {
      name: 'user_id',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    clientId: {
      name: 'client_id',
      type: 'varchar',
      length: 255,
      nullable: false,
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    modeId: {
      name: 'mode_id',
      type: 'varchar',
      length: 36,
      nullable: false,
    },
    editStatus: {
      name: 'edit_status',
      type: 'simple-enum',
      enum: Object.values(EDIT_STATUS),
      nullable: false,
    },
    committedAt: {
      name: 'committed_at',
      type: 'datetime',
      nullable: true,
    },
    commitMessage: {
      name: 'commit_message',
      type: 'text',
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'datetime',
      createDate: true,
    },
  },
  indices: [
    {
      name: 'idx_edit_sessions_file',
      columns: ['fileSystemId'],
    },
    {
      name: 'idx_edit_sessions_status',
      columns: ['editStatus'],
    },
    {
      name: 'idx_edit_sessions_mode',
      columns: ['modeId'],
    },
  ],
});
