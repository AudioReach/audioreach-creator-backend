/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {SESSION_MODE} from '../../../../application/shared/change-vocabulary.js';
import type {AutoRoutingCommandInput} from '../contracts/routing-command-input.js';

export class CreateUsecasesCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;

  constructor(
    public readonly fileSystemId: number,
    public readonly input: AutoRoutingCommandInput,
  ) {
    super();
  }
}
