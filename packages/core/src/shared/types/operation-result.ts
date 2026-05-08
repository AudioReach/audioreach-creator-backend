/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Generic result type for repository operations that can fail with a message.
 * Discriminated union — TypeScript narrows `data` when `success` is true.
 * Placeholder: will be extended with more context in future iterations.
 */
export type OperationResult<T> =
  | {readonly success: true; readonly data: T}
  | {readonly success: false; readonly errorMessage: string};
