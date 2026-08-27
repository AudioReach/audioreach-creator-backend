/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

export interface TkvParameterRemoveItem {
  tkvSystemId: string;
  parameterSystemIds: string[];
}

export class RemoveTkvParametersCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly updates: Array<{tkvSystemId: number; parameterSystemIds: number[]}>;

  constructor(spfModuleSystemId: string, updates: TkvParameterRemoveItem[]) {
    super();
    this.spfModuleSystemId = Number(spfModuleSystemId);
    this.updates = updates.map(u => ({
      tkvSystemId: Number(u.tkvSystemId),
      parameterSystemIds: u.parameterSystemIds.map(Number),
    }));
  }
}
