/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ValidationPreferencesRepository,
  ValidationPreferences,
} from '@arc/core';
import {EMPTY_PREFERENCES} from '@arc/core';

export class TypeOrmValidationPreferencesRepository implements ValidationPreferencesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getPreferences(fileSystemId: number): Promise<ValidationPreferences> {
    const result: {preferences: string}[] = await this.dataSource.query(
      `SELECT preferences FROM validation_preferences WHERE file_system_id = ?`,
      [fileSystemId],
    );
    if (!result || result.length === 0) return EMPTY_PREFERENCES;
    try {
      return JSON.parse(result[0].preferences) as ValidationPreferences;
    } catch {
      return EMPTY_PREFERENCES;
    }
  }

  async savePreferences(
    fileSystemId: number,
    prefs: ValidationPreferences,
  ): Promise<void> {
    const json = JSON.stringify(prefs);
    await this.dataSource.query(
      `INSERT INTO validation_preferences (file_system_id, preferences, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(file_system_id) DO UPDATE
         SET preferences = excluded.preferences,
             updated_at  = CURRENT_TIMESTAMP`,
      [fileSystemId, json],
    );
  }
}
