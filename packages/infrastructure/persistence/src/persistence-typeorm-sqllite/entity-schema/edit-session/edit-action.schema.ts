/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ProjectSessionRow} from './project-session.schema.js';

export const EDIT_OPERATION = {
  Add: 'ADD',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;
export type EditOperation =
  (typeof EDIT_OPERATION)[keyof typeof EDIT_OPERATION];

export const CHANGE_STATUS = {
  Unstaged: 'UNSTAGED',
  Staged: 'STAGED',
  Discarded: 'DISCARDED',
} as const;
export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];

export interface EditActionRow {
  changeId: number;
  systemId: number;
  aggregateId: number;
  sessionId: number;
  tableName: string;
  operation: EditOperation;
  payload: unknown; // json
  changeStatus: ChangeStatus;
  baseVersion: number | null;
  groupId: string | null;
  createdAt: Date;
  validUntil: Date | null;
  session?: ProjectSessionRow;
}

export const EditActionSchema = new EntitySchema<EditActionRow>({
  name: 'EditAction',
  tableName: 'edit_actions',
  columns: {
    changeId: {
      name: 'change_id',
      type: 'integer',
      primary: true,
      generated: 'increment',
    },
    systemId: {
      name: 'system_id',
      type: 'integer',
      nullable: false,
    },
    aggregateId: {
      name: 'aggregate_id',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    sessionId: {
      name: 'session_id',
      type: 'integer',
      nullable: false,
    },
    tableName: {
      name: 'table_name',
      type: 'varchar',
      length: 100,
      nullable: false,
    },
    operation: {
      name: 'operation',
      type: 'simple-enum',
      enum: Object.values(EDIT_OPERATION),
    },
    payload: {
      name: 'payload',
      type: 'simple-json',
      nullable: false,
    },
    changeStatus: {
      name: 'change_status',
      type: 'simple-enum',
      enum: Object.values(CHANGE_STATUS),
      default: CHANGE_STATUS.Staged,
    },
    baseVersion: {
      name: 'base_version',
      type: 'integer',
      nullable: true,
    },
    groupId: {
      name: 'group_id',
      type: 'text',
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'datetime',
      createDate: true,
    },
    validUntil: {
      name: 'valid_until',
      type: 'datetime',
      nullable: true,
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
      name: 'idx_edit_actions_session',
      columns: ['sessionId'],
    },
    {
      name: 'idx_edit_actions_entity_active',
      columns: ['sessionId', 'systemId'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_table_active',
      columns: ['sessionId', 'tableName'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_agg_active',
      columns: ['sessionId', 'aggregateId'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_status_active',
      columns: ['sessionId', 'changeStatus'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'uniq_edit_actions_current',
      columns: ['sessionId', 'systemId'],
      unique: true,
      where: '"valid_until" IS NULL',
    },
  ],
});
