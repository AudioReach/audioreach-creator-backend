/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {UpdateValidationPreferencesCommand} from './update-validation-preferences.command.js';
import {SEVERITY_ORDER} from '../../../domain/validation/issue.js';
import type {ValidationPreferences} from '../../../domain/validation/validation-preferences.js';

/**
 * Handles UpdateValidationPreferencesCommand.
 *
 * Merges the incoming overrides/suppressions into the existing preferences
 * and persists them. Enforces:
 *   - severityOverride must be strictly higher than the current value (escalation only)
 *   - Suppression key format: "code:entityType:systemId"
 */
export class UpdateValidationPreferencesHandler implements CommandHandler<
  UpdateValidationPreferencesCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: UpdateValidationPreferencesCommand): Promise<void> {
    const repo = this.uow.getValidationPreferencesRepository();
    const existing = await repo.getPreferences(command.fileSystemId);

    // Merge overrides — validate each entry
    const mergedOverrides: ValidationPreferences['overrides'] = {
      ...existing.overrides,
    };

    for (const [code, pref] of Object.entries(command.overrides)) {
      if (
        pref.severityOverride !== undefined &&
        !SEVERITY_ORDER.includes(pref.severityOverride)
      ) {
        throw new Error(
          `Invalid severityOverride '${pref.severityOverride}' for issue code '${code}'`,
        );
      }
      mergedOverrides[code] = {...mergedOverrides[code], ...pref};
    }

    // Merge suppressions — validate key format
    const mergedSuppressions: ValidationPreferences['suppressions'] = {
      ...existing.suppressions,
    };

    if (command.suppressions) {
      for (const [key, suppression] of Object.entries(command.suppressions)) {
        const parts = key.split(':');
        if (parts.length !== 3) {
          throw new Error(
            `Invalid suppression key format: '${key}'. Expected 'code:entityType:systemId'`,
          );
        }
        mergedSuppressions[key] = suppression;
      }
    }

    await repo.savePreferences(command.fileSystemId, {
      overrides: mergedOverrides,
      suppressions: mergedSuppressions,
    });
  }
}
