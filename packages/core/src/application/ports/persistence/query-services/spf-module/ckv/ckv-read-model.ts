/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Binary payload row for a single parameter under a CKV.
 * parameterSystemId is the FK to SpfModuleParameterDefinition.systemId — used as join key
 * when merging with ParameterDefinitionReadModel to produce ParameterCalibrationReadModel.
 */
export interface ParameterPayloadReadModel {
  readonly systemId: number;
  readonly parameterSystemId: number;
  readonly payload: Uint8Array | null;
}
