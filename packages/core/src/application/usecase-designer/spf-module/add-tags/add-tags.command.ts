/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

export class AddTagsCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly tagDefinitionSystemIds: number[];

  constructor(spfModuleSystemId: string, tagDefinitionSystemIds: string[]) {
    super();
    this.spfModuleSystemId = Number(spfModuleSystemId);
    this.tagDefinitionSystemIds = tagDefinitionSystemIds.map(Number);
  }
}
