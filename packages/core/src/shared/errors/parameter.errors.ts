/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ERROR_CODES} from './error-codes.js';

/**
 * Thrown when a query parameter cannot be parsed into the expected type.
 *
 * For example, thrown by `GetCkvCalibrationDataQuery` when `projectId`,
 * `spfModuleSystemId`, `ckvSystemId`, or an entry in `param-system-ids`
 * is not a valid decimal or hexadecimal integer.
 *
 * Controllers should catch this by type and map it to HTTP 400 (Bad Request).
 */
export class InvalidParameterError extends Error {
  readonly code = ERROR_CODES.INVALID_PARAMETER;

  constructor(
    public readonly paramName: string,
    public readonly value: string,
  ) {
    super(
      `Invalid ${paramName}: "${value}" is not a valid integer or hex value`,
    );
    this.name = 'InvalidParameterError';
  }
}

/**
 * Thrown by `GetCkvCalibrationDataHandler` when a `CkvParameterPayload` row has a
 * non-null payload but no matching `SpfModuleParameterDefinition` row exists for its
 * `parameterSystemId`.
 *
 * `CkvParameterPayload.parameterSystemId` is a foreign key to
 * `SpfModuleParameterDefinition`. A payload without a definition indicates a database
 * integrity violation — distinct from a null payload (`payload IS NULL`).
 *
 * Controllers should catch this by type and map it to HTTP 500 (internal data integrity
 * failure) or surface it as a warning in `ApiResult.warnings`, depending on policy.
 */
export class ParameterDefinitionMissingError extends Error {
  readonly code = ERROR_CODES.PARAMETER_DEF_MISSING;

  constructor(public readonly parameterSystemId: number) {
    super(
      `No parameter definition found for parameterSystemId=${parameterSystemId} but a payload exists`,
    );
    this.name = 'ParameterDefinitionMissingError';
  }
}

/**
 * Thrown by `GetCkvCalibrationDataHandler` when a `CkvParameterPayload` row has a
 * null payload — a database integrity violation indicating the payload was never written.
 *
 * Controllers should catch this by type and map it to HTTP 500 (internal data integrity
 * failure) or surface it as a warning in `ApiResult.warnings`, depending on policy.
 */
export class NullPayloadError extends Error {
  readonly code = ERROR_CODES.NULL_PAYLOAD;

  constructor(public readonly parameterSystemId: number) {
    super(`Null payload for parameterSystemId=${parameterSystemId}`);
    this.name = 'NullPayloadError';
  }
}
