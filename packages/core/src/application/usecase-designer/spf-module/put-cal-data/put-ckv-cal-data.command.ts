/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {SESSION_MODE} from '../../../shared/change-vocabulary.js';
import type {SessionMode} from '../../../shared/change-vocabulary.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {InvalidOperationException} from '../../../../shared/exceptions/index.js';

export interface ParameterCalDataInput {
  systemId: string; // string from DTO — parsed to number in constructor
  elements: ElementData[];
}

export class PutCkvCalDataCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  public readonly spfModuleSystemId: number;
  public readonly ckvSystemId: number;
  public readonly parameters: Array<{
    systemId: number;
    elements: ElementData[];
  }>;
  public readonly uiPersistence: string | undefined;

  constructor(
    spfModuleSystemIdStr: string,
    ckvSystemIdStr: string,
    parameters: ParameterCalDataInput[],
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

function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (!Number.isInteger(num) || num <= 0) {
    throw new InvalidOperationException(
      `${paramName} must be a positive integer, got: ${value}`,
    );
  }
  return num;
}
