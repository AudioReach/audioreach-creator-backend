/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import {parseId} from '../../shared/parse-id.js';

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
    this.spfModuleSystemId = parseId(spfModuleSystemId, 'spfModuleSystemId');
    this.ckvs = ckvs.map(c => ({
      valueDefinitionSystemIds: [
        ...new Set(
          c.valueSystemIds.map(value => parseId(value, 'valueSystemId')),
        ),
      ],
    }));
  }
}
