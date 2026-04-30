/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ValidationPreferences} from '../../../../../domain/validation/validation-preferences.js';

export interface ValidationPreferencesRepository {
  /** Returns stored preferences for the file, or EMPTY_PREFERENCES if none exist. */
  getPreferences(fileSystemId: number): Promise<ValidationPreferences>;
  /** Persists preferences for the file (upsert). */
  savePreferences(
    fileSystemId: number,
    prefs: ValidationPreferences,
  ): Promise<void>;
}
