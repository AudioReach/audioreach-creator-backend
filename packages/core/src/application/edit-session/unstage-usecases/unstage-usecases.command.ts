/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';

export class UnstageUsecasesCommand extends BaseCommand {
  constructor(public readonly systemIds: readonly number[]) {
    super();
  }
}
