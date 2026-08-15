/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';

function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (Number.isNaN(num)) {
    throw new InvalidOperationException(
      `Invalid ${paramName}: "${value}" is not a valid integer or hex value`,
    );
  }
  return num;
}

export class GetVcpmCalDataQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly subgraphSystemId: number;
  public readonly ckvSystemId: number;
  public readonly paramSystemIds: number[];

  constructor(
    projectIdStr: string,
    subgraphSystemIdStr: string,
    ckvSystemIdStr: string,
    clientId: string,
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
    this.subgraphSystemId = parseId(subgraphSystemIdStr, 'subgraphSystemId');
    this.ckvSystemId = parseId(ckvSystemIdStr, 'ckvSystemId');
    this.paramSystemIds = paramSystemIdsStr
      ? paramSystemIdsStr
          .split(',')
          .map(id => parseId(id.trim(), 'param-system-ids'))
      : [];
  }
}
