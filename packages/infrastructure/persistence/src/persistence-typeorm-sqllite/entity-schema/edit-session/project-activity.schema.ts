/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';

export const PROJECT_ACTIVITY_TYPE = {
  DESIGNER: 'DESIGNER',
  DIFF_MERGE: 'DIFF_MERGE',
  SIMULATION: 'SIMULATION',
} as const;

export type ProjectActivityType =
  (typeof PROJECT_ACTIVITY_TYPE)[keyof typeof PROJECT_ACTIVITY_TYPE];

export interface ProjectActivityRow {
  activityId: string;
  fileSystemId: number;
  artifactFile?: ArcDbFileRow;
  activityType: ProjectActivityType;
  endedAt: Date | null;
  startedAt: Date;
}

export const ProjectActivitySchema = new EntitySchema<ProjectActivityRow>({
  name: 'ProjectActivity',
  tableName: 'project_activities',
  columns: {
    activityId: {
      name: 'activity_id',
      type: 'varchar',
      length: 36,
      primary: true,
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    activityType: {
      name: 'activity_type',
      type: 'simple-enum',
      enum: Object.values(PROJECT_ACTIVITY_TYPE),
      nullable: false,
    },
    endedAt: {
      name: 'ended_at',
      type: 'datetime',
      nullable: true,
    },
    startedAt: {
      name: 'started_at',
      type: 'datetime',
      createDate: true,
    },
  },
  relations: {
    artifactFile: {
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
      name: 'idx_project_activities_file',
      columns: ['fileSystemId'],
    },
    {
      name: 'idx_project_activities_active',
      columns: ['fileSystemId', 'endedAt'],
    },
  ],
});
