/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Binary parameter data identified by its definition system ID.
 * Payload row identities remain inside persistence.
 */
export interface ParameterPayloadReadModel {
  readonly systemId: number;
  readonly payload: Uint8Array | null;
}
