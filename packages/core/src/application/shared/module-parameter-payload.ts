/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Shared serialized parameter payload used by application workflows. */
export interface ModuleParameterPayload {
  parameterDefinitionSystemId: number;
  payload: Uint8Array;
}
