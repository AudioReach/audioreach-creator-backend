/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import type {ParameterDto} from '../dto/parameter-dto.js';
import type {ParameterElementDto} from '../dto/element-dto.js';
import {parseId} from '../../shared/parse-id.js';

export class PutCkvCalDataCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.Tuning,
    SESSION_MODE.DiffMerge,
  ];

  public readonly spfModuleSystemId: number;
  public readonly ckvSystemId: number;
  public readonly parameters: Array<{
    systemId: number;
    elements: ParameterElementDto[];
  }>;
  public readonly uiPersistence: string | undefined;

  constructor(
    spfModuleSystemIdStr: string,
    ckvSystemIdStr: string,
    parameters: ParameterDto[],
    uiPersistence: string | undefined,
  ) {
    super();
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.ckvSystemId = parseId(ckvSystemIdStr, 'ckvSystemId');
    this.parameters = parameters.map(p => ({
      systemId: parseId(p.systemId, 'parameters[].systemId'),
      elements: p.elements,
    }));
    this.uiPersistence = uiPersistence;
  }
}
