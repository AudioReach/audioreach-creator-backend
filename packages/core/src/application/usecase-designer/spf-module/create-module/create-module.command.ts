/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

/**
 * Creates a new SPF module. Three variants:
 *   Variant 1: subgraphSystemId=null, containerSystemId=null → auto-create both
 *   Variant 2: subgraphSystemId provided, containerSystemId=null → validate subgraph, auto-create container
 *   Variant 3: both provided → validate both
 */
export class CreateModuleCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  constructor(
    public readonly moduleDefinitionSystemId: number,
    public readonly processorSystemId: number,
    public readonly parentSystemId: number | null,
    public readonly subgraphSystemId: number | null,
    public readonly containerSystemId: number | null,
  ) {
    super();
  }
}
