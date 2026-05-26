/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class CreateDataLinkCommand extends BaseCommand {
  constructor(
    public readonly sourceNodeSystemId: number,
    public readonly sourcePortSystemId: number,
    public readonly destinationNodeSystemId: number,
    public readonly destinationPortSystemId: number,
    public readonly type: 'normal' | 'EC' | 'interUsecase',
    clientId: string,
  ) {
    super(clientId);
  }
}
