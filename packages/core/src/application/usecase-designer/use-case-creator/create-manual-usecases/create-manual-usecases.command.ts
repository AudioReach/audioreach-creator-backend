/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {SESSION_MODE} from '../../../../application/shared/change-vocabulary.js';
import {
  parseRoutingCommandInput,
  type RoutingCommandInput,
} from '../contracts/routing-command-input.js';
import type {RoutingSelection} from '../contracts/routing-input.js';

export class CreateManualUsecasesCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;

  readonly selection: RoutingSelection;

  constructor(
    public readonly fileSystemId: number,
    input: RoutingCommandInput,
  ) {
    super();
    this.selection = parseRoutingCommandInput(input);
  }
}
