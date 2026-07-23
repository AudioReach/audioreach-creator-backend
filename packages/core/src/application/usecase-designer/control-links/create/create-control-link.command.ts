/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class CreateControlLinkCommand extends BaseCommand {
  constructor(
    public readonly peerNodeASystemId: number,
    public readonly nodeAPortSystemId: number,
    public readonly peerNodeBSystemId: number,
    public readonly nodeBPortSystemId: number,
    public readonly heapId: number,
  ) {
    super();
  }
}
