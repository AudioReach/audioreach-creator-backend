/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import type {ParameterDto} from '../dto/parameter-dto.js';
import type {ParameterElementDto} from '../dto/element-dto.js';
import {InvalidOperationException} from '../../../../shared/exceptions/index.js';

export class UpdateTkvCalDataCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  public readonly spfModuleSystemId: number;
  public readonly tagSystemId: number;
  public readonly tkvSystemId: number;
  public readonly parameters: Array<{
    systemId: number;
    elements: ParameterElementDto[];
  }>;
  public readonly uiPersistence: string | undefined;

  constructor(
    spfModuleSystemIdStr: string,
    tagSystemIdStr: string,
    tkvSystemIdStr: string,
    parameters: ParameterDto[],
    uiPersistence: string | undefined,
  ) {
    super();
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.tagSystemId = parseId(tagSystemIdStr, 'tagSystemId');
    this.tkvSystemId = parseId(tkvSystemIdStr, 'tkvSystemId');
    this.parameters = parameters.map(p => ({
      systemId: parseId(p.systemId, 'parameters[].systemId'),
      elements: p.elements,
    }));
    this.uiPersistence = uiPersistence;
  }
}

function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new InvalidOperationException(
      `${paramName} must be an integer, got: ${value}`,
    );
  }
  if (num <= 0) {
    throw new InvalidOperationException(
      `${paramName} must be positive, got: ${value}`,
    );
  }
  return num;
}
