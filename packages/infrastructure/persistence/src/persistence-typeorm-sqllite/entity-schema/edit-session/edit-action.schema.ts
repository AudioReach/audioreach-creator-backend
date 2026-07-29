/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ProjectSessionRow} from './project-session.schema.js';
import type {ChangeOperation, ChangeStatus, Source} from '@arc/core';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import type {EntityName} from '../entity-table-names.js';
import {
  serializeBlobs,
  deserializeBlobs,
} from '../../utils/blob-serialization.js';

export interface EditActionRow {
  changeId: number;
  sessionId: number;
  aggregateId: number;
  targetSystemId: number;
  targetTable: EntityName;
  operation: ChangeOperation;
  fieldPath: string | null;
  newValue: unknown; // simple-json
  source: Source;
  changeStatus: ChangeStatus;
  groupId: string | null;
  linkedEntityGroupId: string | null;
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
    sessionId: {
      name: 'session_id',
      type: 'integer',
      nullable: false,
    },
    aggregateId: {
      name: 'aggregate_id',
      type: 'integer',
      nullable: false,
      default: 0,
    },
    targetSystemId: {
      name: 'target_system_id',
      type: 'integer',
      nullable: false,
    },
    targetTable: {
      name: 'target_table',
      type: 'varchar',
      length: 100,
      nullable: false,
    },
    operation: {
      name: 'operation',
      type: 'simple-enum',
      enum: Object.values(CHANGE_OPERATION),
    },
    fieldPath: {
      name: 'field_path',
      type: 'varchar',
      nullable: true,
    },
    newValue: {
      name: 'new_value',
      type: 'simple-json',
      nullable: true,
      transformer: {
        to: (value: unknown) => serializeBlobs(value),
        from: (value: unknown) => deserializeBlobs(value),
      },
    },
    source: {
      name: 'source',
      type: 'simple-enum',
      enum: Object.values(SOURCE),
      nullable: false,
    },
    changeStatus: {
      name: 'change_status',
      type: 'simple-enum',
      enum: Object.values(CHANGE_STATUS),
      default: CHANGE_STATUS.Staged,
    },
    groupId: {
      name: 'group_id',
      type: 'text',
      nullable: true,
    },
    linkedEntityGroupId: {
      name: 'linked_entity_group_id',
      type: 'varchar',
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
      name: 'uniq_edit_actions_current',
      columns: ['sessionId', 'targetSystemId', 'fieldPath'],
      unique: true,
      where: '"valid_until" IS NULL',
    },
    {
      // SQLite treats each NULL as distinct in unique indexes, so the above
      // index does NOT enforce uniqueness for accumulator rows (fieldPath IS NULL).
      // This separate index covers that case.
      name: 'uniq_edit_actions_current_null_path',
      columns: ['sessionId', 'targetSystemId'],
      unique: true,
      where: '"valid_until" IS NULL AND "field_path" IS NULL',
    },
    {
      name: 'idx_edit_actions_agg_active',
      columns: ['sessionId', 'aggregateId'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_table_active',
      columns: ['sessionId', 'targetTable'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_status_active',
      columns: ['sessionId', 'changeStatus'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_source_active',
      columns: ['sessionId', 'source'],
      where: '"valid_until" IS NULL',
    },
    {
      name: 'idx_edit_actions_xgroup_active',
      columns: ['sessionId', 'linkedEntityGroupId'],
      where: '"valid_until" IS NULL AND "linked_entity_group_id" IS NOT NULL',
    },
  ],
});
