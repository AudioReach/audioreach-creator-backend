/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';
import type {SessionMode} from '../../shared/change-vocabulary.js';

/** Case 3 — no session required (§7a.2, §7b.1). */
export class StartSessionCommand extends BaseCommand {
  static override readonly requiresSession = false;
  static override readonly allowedModes: readonly SessionMode[] = [];

  constructor(
    public readonly projectId: string,
    public readonly mode: SessionMode,
    public readonly userId?: string,
  ) {
    super();
  }
}
