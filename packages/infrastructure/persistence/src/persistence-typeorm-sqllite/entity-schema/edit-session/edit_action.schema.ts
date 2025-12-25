import {EntitySchema} from 'typeorm';

export const EDIT_OPERATION = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};
export type EditOperation =
  (typeof EDIT_OPERATION)[keyof typeof EDIT_OPERATION];

export const CHANGE_STATUS = {
  UNSTAGED: 'UNSTAGED',
  STAGED: 'STAGED',
  DISCARDED: 'DISCARDED',
};
export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];

export interface EditActionRow {
  changeId: string;
  systemId: string;
  sessionId: string;
  tableName: string;
  operation: EditOperation;
  payload: string; //json
  changeStatus: ChangeStatus;
  baseVersion: number | null;
  groupId: string | null;
  createdAt: Date;
  validUntil: Date | null;
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
      type: 'text',
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
