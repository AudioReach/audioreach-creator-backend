/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {
  SESSION_MODE,
  SOURCE,
} from '../../../../application/shared/change-vocabulary.js';
import {parseRemoveStaleManualUsecaseEditPayload} from '../contracts/fix-command-input.js';

export class RemoveStaleManualUsecaseEditCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;

  readonly source = SOURCE.Manual;

  constructor(public readonly changeIds: readonly number[]) {
    super();
  }

  static fromPayload(
    payload: Record<string, unknown>,
  ): RemoveStaleManualUsecaseEditCommand {
    const parsed = parseRemoveStaleManualUsecaseEditPayload(payload);
    return new RemoveStaleManualUsecaseEditCommand(parsed.changeIds);
  }
}
