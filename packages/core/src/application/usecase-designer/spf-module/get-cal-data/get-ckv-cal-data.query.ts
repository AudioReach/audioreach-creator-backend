/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseQuery} from '../../../shared/base-query.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';

/**
 * Parses a string as a decimal or hexadecimal integer.
 * File-private helper — not exported.
 * Throws `InvalidOperationException` if the value is not a valid integer.
 */
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
 * Query to retrieve calibration data for a specific CKV (Calibration Key-Value)
 * belonging to an SPF module.
 *
 * All ID parameters are accepted as raw strings (as received from the HTTP layer)
 * and parsed to integers in the constructor. Decimal and hexadecimal (0x prefix)
 * notation are both supported. Throws `InvalidOperationException` if any value
 * cannot be parsed. The global exception filter maps this to HTTP 400 automatically.
 *
 * Dispatched by the controller and handled by `GetCkvCalibrationDataHandler`.
 */
export class GetCkvCalibrationDataQuery extends BaseQuery {
  /** Project that owns the SPF module. */
  public readonly projectId: number;
  /** System ID of the SPF module instance. */
  public readonly spfModuleSystemId: number;
  /** System ID of the CKV to retrieve calibration data for. */
  public readonly ckvSystemId: number;
  /** Filter: only return data for these parameter system IDs; empty means all. */
  public readonly paramSystemIds: number[];

  constructor(
    projectIdStr: string,
    spfModuleSystemIdStr: string,
    ckvSystemIdStr: string,
    clientId: string,
    /** Optional comma-separated list of parameter system IDs (decimal or hex). */
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.ckvSystemId = parseId(ckvSystemIdStr, 'ckvSystemId');
    this.paramSystemIds = paramSystemIdsStr
      ? paramSystemIdsStr
          .split(',')
          .map(id => parseId(id.trim(), 'param-system-ids'))
      : [];
  }
}
