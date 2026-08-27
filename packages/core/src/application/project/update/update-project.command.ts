/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';

export class UpdateProjectCommand extends BaseCommand {
  static override readonly requiresSession = false;
  static override readonly allowedModes = [] as const;

  constructor(
    public readonly projectId: number,
    public readonly name?: string,
    public readonly description?: string,
  ) {
    super();
  }
}
