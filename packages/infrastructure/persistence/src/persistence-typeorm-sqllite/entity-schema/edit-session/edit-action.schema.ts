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
  linkedEntityGroupId: string | null;
  createdAt: Date;
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
      nullable: false,
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
      // Each non-null field path is one independently replaceable current slot.
      name: 'uniq_edit_actions_slot',
      columns: ['sessionId', 'targetTable', 'targetSystemId', 'fieldPath'],
      unique: true,
      where: '"field_path" IS NOT NULL',
    },
    {
      // SQLite allows multiple NULL values in a unique index. This separate
      // index makes the null field path a single target-wide accumulator slot.
      name: 'uniq_edit_actions_null_slot',
      columns: ['sessionId', 'targetTable', 'targetSystemId'],
      unique: true,
      where: '"field_path" IS NULL',
    },
    {
      name: 'idx_edit_actions_aggregate',
      columns: ['sessionId', 'aggregateId'],
    },
    {
      name: 'idx_edit_actions_target',
      columns: ['sessionId', 'targetTable', 'targetSystemId'],
    },
    {
      name: 'idx_edit_actions_source',
      columns: ['sessionId', 'source'],
    },
    {
      name: 'idx_edit_actions_status',
      columns: ['sessionId', 'changeStatus'],
    },
    {
      name: 'idx_edit_actions_linked_group',
      columns: ['sessionId', 'linkedEntityGroupId'],
      where: '"linked_entity_group_id" IS NOT NULL',
    },
  ],
});
