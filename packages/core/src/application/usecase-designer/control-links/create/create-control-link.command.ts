/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';

export class CreateControlLinkCommand extends BaseCommand {
  constructor(
    public readonly startNodeSystemId: number,
    public readonly startPortSystemId: number,
    public readonly endNodeSystemId: number,
    public readonly endPortSystemId: number,
    public readonly heapId: number,
    public readonly isInterUsecase: boolean,
    public readonly parentId: number | null,
    /** When true, subsystem node IDs are accepted at start/end. */
    public readonly allowSubsystemNodes: boolean,
  ) {
    super();
  }
}
