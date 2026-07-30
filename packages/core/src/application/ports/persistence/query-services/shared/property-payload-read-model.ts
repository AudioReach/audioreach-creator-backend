/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface PropertyPayloadReadModel {
  readonly systemId: number;
  readonly propertySystemId: number;
  readonly payload: Uint8Array | null;
}
