/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class CreateDataLinkWithSubsystemsCommand extends BaseCommand {
  constructor(
    public readonly sourceNodeSystemId: string,
    public readonly sourcePortSystemId: string,
    public readonly destinationNodeSystemId: string,
    public readonly destinationPortSystemId: string,
    public readonly isInterUsecase?: boolean,
    public readonly isEc?: boolean,
  ) {
    super();
  }
}
