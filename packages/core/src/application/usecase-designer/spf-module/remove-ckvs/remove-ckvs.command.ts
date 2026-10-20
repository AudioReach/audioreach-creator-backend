/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import {parseId} from '../../shared/parse-id.js';
import {InvalidInputException} from '../../../../shared/exceptions/invalid-input.exception.js';

export class RemoveCkvsCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  readonly spfModuleSystemId: number;
  readonly ckvSystemIds: number[];

  constructor(spfModuleSystemId: string, ckvSystemIds: string[]) {
    super();
    this.spfModuleSystemId = parseId(spfModuleSystemId, 'spfModuleSystemId');
    this.ckvSystemIds = ckvSystemIds.map(value =>
      parseId(value, 'ckvSystemId'),
    );
  }

  static fromPayload(payload: Record<string, unknown>): RemoveCkvsCommand {
    const ckvSystemIds = payload['ckvSystemIds'];
    if (!Array.isArray(ckvSystemIds)) {
      throw new InvalidInputException('ckvSystemIds must be an array');
    }
    return new RemoveCkvsCommand(
      String(payload['spfModuleSystemId']),
      ckvSystemIds.map(String),
    );
  }
}
