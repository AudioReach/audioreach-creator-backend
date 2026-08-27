/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import {LINK_DELETION_MODE} from './link-deletion-mode.js';
import type {LinkDeletionMode} from './link-deletion-mode.js';

export class DeleteSpfModuleCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
  ];

  // TODO(diff-merge-selection-dependencies): add SessionMode.DiffMerge after
  // module-delete registers and stages required dependency closures.
  constructor(
    public readonly spfModuleSystemId: number,
    public readonly linkDeletionMode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ) {
    super();
  }
}
