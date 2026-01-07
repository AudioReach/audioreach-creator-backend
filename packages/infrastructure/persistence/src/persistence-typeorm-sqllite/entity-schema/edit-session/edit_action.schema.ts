import {EntitySchema} from 'typeorm';
import type {EditSessionRow} from './edit-session.schema.js';

export const EDIT_OPERATION = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export type EditOperation =
  (typeof EDIT_OPERATION)[keyof typeof EDIT_OPERATION];

export const CHANGE_STATUS = {
  UNSTAGED: 'UNSTAGED',
  STAGED: 'STAGED',
  DISCARDED: 'DISCARDED',
} as const;
export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];

export interface EditActionRow {
  changeId: string;
  systemId: string;
  sessionId: string;
  tableName: string;
  operation: EditOperation;
  payload: unknown; //json
  changeStatus: ChangeStatus;
  baseVersion: number | null;
  groupId: string | null;
  createdAt: Date;
  validUntil: Date | null;
  session?: EditSessionRow;
}

export const EditActionSchema = new EntitySchema<EditActionRow>({
  name: 'EditAction',
  tableName: 'edit_actions',
  columns: {
    changeId: {
      name: 'change_id',
      type: 'varchar',
      length: 36,
      primary: true,
    },
    systemId: {
      name: 'system_id',
      type: 'varchar',
      length: 36,
      nullable: false,
    },
    sessionId: {
      name: 'session_id',
      type: 'varchar',
      length: 36,
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
      default: CHANGE_STATUS.STAGED,
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
      target: 'EditSession',
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
      name: 'idx_edit_actions_system_id',
      columns: ['systemId', 'tableName'],
    },
    {
      name: 'idx_edit_actions_valid',
      columns: ['validUntil'],
    },
    {
      name: 'idx_edit_actions_status',
      columns: ['sessionId', 'changeStatus'],
    },
  ],
});
