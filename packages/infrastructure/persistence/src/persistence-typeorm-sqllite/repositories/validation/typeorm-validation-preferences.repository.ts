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
import {ValidationPreferencesSchema} from '../../entity-schema/validation/validation-preferences.schema.js';

export class TypeOrmValidationPreferencesRepository implements ValidationPreferencesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getPreferences(fileSystemId: number): Promise<ValidationPreferences> {
    const row = await this.dataSource.manager.findOne(
      ValidationPreferencesSchema,
      {where: {fileSystemId}},
    );
    if (!row) return EMPTY_PREFERENCES;
    try {
      return JSON.parse(row.preferences) as ValidationPreferences;
    } catch {
      return EMPTY_PREFERENCES;
    }
  }

  async savePreferences(
    fileSystemId: number,
    prefs: ValidationPreferences,
  ): Promise<void> {
    await this.dataSource.manager.upsert(
      ValidationPreferencesSchema,
      {fileSystemId, preferences: JSON.stringify(prefs), updatedAt: new Date()},
      ['fileSystemId'],
    );
  }
}
