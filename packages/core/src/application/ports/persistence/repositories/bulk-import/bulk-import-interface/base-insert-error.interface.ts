/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface BaseInsertError {
  /** System ID of the failing entity */
  systemId: number;

  /** Human-readable error message */
  message: string;

  /** System ID of parent entity (if child failed) */
  parentSystemId?: number;
}
