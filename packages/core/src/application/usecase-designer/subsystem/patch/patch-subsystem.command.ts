/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

export class PatchSubsystemCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  constructor(
    public readonly subsystemSystemId: number,
    public readonly fileSystemId: number,
    public readonly name: string | undefined,
    public readonly inputDataPortCount: number | undefined,
    public readonly outputDataPortCount: number | undefined,
    public readonly controlPortCount: number | undefined,
  ) {
    super();
  }
}
