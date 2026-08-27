/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import {parseId} from '../../shared/parse-id.js';

export interface CreateTkvItem {
  valueSystemIds: string[];
}

export class AddTkvsCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly tagSystemId: number;
  readonly tkvs: Array<{valueDefinitionSystemIds: number[]}>;

  constructor(
    spfModuleSystemId: string,
    tagSystemId: string,
    tkvs: CreateTkvItem[],
  ) {
    super();
    this.spfModuleSystemId = parseId(spfModuleSystemId, 'spfModuleSystemId');
    this.tagSystemId = parseId(tagSystemId, 'tagSystemId');
    this.tkvs = tkvs.map(t => ({
      valueDefinitionSystemIds: [
        ...new Set(
          t.valueSystemIds.map(value => parseId(value, 'valueSystemId')),
        ),
      ],
    }));
  }
}
