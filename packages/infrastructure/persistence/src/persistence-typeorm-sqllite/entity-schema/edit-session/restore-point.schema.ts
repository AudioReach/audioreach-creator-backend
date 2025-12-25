import {EntitySchema} from 'typeorm';

export const RESTORE_TYPE = {
  EDIT_SNAPSHOT: 'EDIT_SNAPSHOT',
  FULL_SNAPSHOT: 'FULL_SNAPSHOT',
};

export type RestoreType = (typeof RESTORE_TYPE)[keyof typeof RESTORE_TYPE];

export interface RestorePointRow {
  systemId: string; // Primary key (GUID)
  sessionId: string | null;
  fileSystemId: number;
  restoreType: RestoreType;
  snapshotData: string; //json
  description: string | null;
  createdAt: Date;
}

export const RestorePointSchema = new EntitySchema<RestorePointRow>({
  name: 'RestorePoint',
  tableName: 'restore_points',
  columns: {
    systemId: {
      name: 'system_id',
      type: 'varchar',
      length: 36,
      primary: true,
    },
    sessionId: {
      name: 'session_id',
      type: 'varchar',
      length: 36,
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
