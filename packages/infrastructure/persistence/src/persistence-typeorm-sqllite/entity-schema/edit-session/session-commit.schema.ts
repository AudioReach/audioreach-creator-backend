/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ProjectSessionRow} from './project-session.schema.js';

export interface SessionCommitRow {
  commitId: number;
  sessionId: number;
  commitMessage: string;
  committedAt: Date;
  changeCount: number;
  session?: ProjectSessionRow;
}

export const SessionCommitSchema = new EntitySchema<SessionCommitRow>({
  name: 'SessionCommit',
  tableName: 'session_commits',
  columns: {
    commitId: {
      name: 'commit_id',
      type: 'integer',
      primary: true,
      generated: 'increment',
    },
    sessionId: {
      name: 'session_id',
      type: 'integer',
      nullable: false,
    },
    commitMessage: {
      name: 'commit_message',
      type: 'text',
      nullable: false,
    },
    committedAt: {
      name: 'committed_at',
      type: 'datetime',
      createDate: true,
    },
    changeCount: {
      name: 'change_count',
      type: 'integer',
      nullable: false,
      default: 0,
    },
  },
  relations: {
    session: {
      type: 'many-to-one',
      target: 'ProjectSession',
      joinColumn: {name: 'session_id'},
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_session_commits_session',
      columns: ['sessionId'],
    },
  ],
});
