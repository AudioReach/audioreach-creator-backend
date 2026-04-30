/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';

export interface ValidationPreferencesRow {
  /** Foreign key to arc_db_files.system_id */
  fileSystemId: number;
  /** JSON blob: { overrides: Record<string, IssuePreference>, suppressions: Record<string, IssueSuppression> } */
  preferences: string;
  updatedAt: Date;
}

export const ValidationPreferencesSchema =
  new EntitySchema<ValidationPreferencesRow>({
    name: 'ValidationPreferences',
    tableName: 'validation_preferences',
    columns: {
      fileSystemId: {
        type: 'integer',
        primary: true,
        name: 'file_system_id',
      },
      preferences: {
        type: 'text',
        name: 'preferences',
        default: '{"overrides":{},"suppressions":{}}',
      },
      updatedAt: {
        type: 'datetime',
        name: 'updated_at',
        createDate: true,
      },
    },
  });
