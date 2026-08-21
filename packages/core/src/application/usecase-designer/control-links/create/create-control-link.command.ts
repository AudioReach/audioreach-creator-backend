/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import type {ControlLinkType} from '../../../../domain/entities/usecase-data/links/control-link-type.js';

export class CreateControlLinkCommand extends BaseCommand {
  constructor(
    public readonly linkType: ControlLinkType,
    public readonly peerNodeASystemId: number,
    public readonly nodeAPortSystemId: number,
    public readonly peerNodeBSystemId: number,
    public readonly nodeBPortSystemId: number,
    public readonly heapId: number,
    public readonly isInterUsecase: boolean,
    public readonly parentId: number | null,
    /** When true, subsystem node IDs are accepted at start/end. */
    public readonly allowSubsystemNodes: boolean,
  ) {
    super();
  }
}
