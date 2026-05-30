/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Represents a structured error in a command/query result.
 * Compatible with API-layer error DTOs via structural typing.
 */
export interface ResultError {
  /** Machine-readable error code (e.g., ERR_3001, ERR_4001) */
  code: string;
  /** Human-readable error detail */
  message: string;
  /** Identifier of the item that failed (if applicable) */
  id?: string;
}

/**
 * Represents a structured warning in a command/query result.
 * Compatible with API-layer warning DTOs via structural typing.
 */
export interface ResultWarning {
  /** Machine-readable warning code */
  code: string;
  /** Human-readable warning detail */
  message: string;
}
