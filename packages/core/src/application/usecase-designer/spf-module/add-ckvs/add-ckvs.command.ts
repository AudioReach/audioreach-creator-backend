/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

export interface CreateCkvItem {
  valueSystemIds: string[];
}

export class AddCkvsCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly ckvs: Array<{valueDefinitionSystemIds: number[]}>;

  constructor(spfModuleSystemId: string, ckvs: CreateCkvItem[]) {
    super();
    this.spfModuleSystemId = Number(spfModuleSystemId);
    this.ckvs = ckvs.map(c => ({
      valueDefinitionSystemIds: c.valueSystemIds.map(Number),
    }));
  }
}
