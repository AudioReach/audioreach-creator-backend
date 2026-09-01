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

/**
 * Query to retrieve tag data for a specific TKV (Tag Key-Value) bin
 * belonging to an SPF module, scoped to a moduleTagIdMap entry (tagSystemId).
 *
 * All ID parameters are accepted as raw strings (as received from the HTTP layer)
 * and parsed to integers in the constructor. Decimal and hexadecimal (0x prefix)
 * notation are both supported. Throws `InvalidOperationException` if any value
 * cannot be parsed — the global exception filter maps this to HTTP 400.
 */
export class GetTkvCalibrationDataQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly spfModuleSystemId: number;
  /** moduleTagIdMapSystemId — PK of the module_tag_id_map row that owns this TKV. */
  public readonly tagSystemId: number;
  public readonly tkvSystemId: number;
  /** PKs of tkv_parameter_payload rows to return. Empty = all payloads. */
  public readonly paramSystemIds: number[];

  constructor(
    projectIdStr: string,
    spfModuleSystemIdStr: string,
    tagSystemIdStr: string,
    tkvSystemIdStr: string,
    clientId: string,
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.tagSystemId = parseId(tagSystemIdStr, 'tagSystemId');
    this.tkvSystemId = parseId(tkvSystemIdStr, 'tkvSystemId');
    this.paramSystemIds = paramSystemIdsStr
      ? paramSystemIdsStr
          .split(',')
          .map(id => parseId(id.trim(), 'param-system-ids'))
      : [];
  }
}
