/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class PatchControlLinkPropertiesCommand extends BaseCommand {
  constructor(
    public readonly controlLinkSystemId: number,
    public readonly allocatedIntents?: {id: number; name: string}[],
    public readonly heapId?: number,
  ) {
    super();
  }
}
