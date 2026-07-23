/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';
import type {
  IssuePreference,
  IssueSuppression,
} from '../../../domain/validation/validation-preferences.js';

export class UpdateValidationPreferencesCommand extends BaseCommand {
  constructor(
    public readonly fileSystemId: number,
    /** Global overrides by issue code — merged into existing preferences. */
    public readonly overrides: Record<string, IssuePreference>,
    /** Instance-level suppressions — merged into existing preferences. */
    public readonly suppressions?: Record<string, IssueSuppression>,
  ) {
    super();
  }
}
