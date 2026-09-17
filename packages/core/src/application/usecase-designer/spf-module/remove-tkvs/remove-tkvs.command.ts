/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';

export class RemoveTkvsCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly tagSystemId: number;
  readonly tkvSystemIds: number[];

  constructor(
    spfModuleSystemId: string,
    tagSystemId: string,
    tkvSystemIds: string[],
  ) {
    super();
    this.spfModuleSystemId = Number(spfModuleSystemId);
    this.tagSystemId = Number(tagSystemId);
    this.tkvSystemIds = tkvSystemIds.map(Number);
  }
}
