/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';
import type {SessionMode} from '../../shared/change-vocabulary.js';

export class DiscardChangesCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [];

  constructor(public readonly projectId: string) {
    super();
  }
}
