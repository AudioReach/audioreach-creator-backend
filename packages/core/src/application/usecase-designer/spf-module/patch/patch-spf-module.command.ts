/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

/**
 * Backs PATCH /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId.
 *
 * All payload fields are optional — the handler applies only those that are
 * defined. All applied changes share one groupId → one atomic undo/redo unit.
 */
export class PatchSpfModuleCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  constructor(
    public readonly spfModuleSystemId: number,
    public readonly alias?: string,
    public readonly containerId?: number,
    public readonly maxInputPortsSupported?: number,
    public readonly maxOutputPortsSupported?: number,
    public readonly maxControlPortsSupported?: number,
  ) {
    super();
  }
}
