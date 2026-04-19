/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Represents a single aggregate-level insert failure.
 *
 * - `message`: identifies which SpfModule failed (instanceId + systemId).
 * - `detailMessage`: all child entity failures joined with newlines, with the
 *   aggregate summary appended at the end.
 *
 * Example detailMessage:
 *   "Control Port: Failed to insert\n{...row json...}\nerror: UNIQUE constraint failed\n
 *    CKV: Failed to insert\n{...row json...}\nerror: UNIQUE constraint failed\n
 *    aggregate: {instanceId=42, systemId=100}"
 */
export type BulkInsertError = {
  readonly message: string;
  readonly details: string;
};

export type BulkInsertResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly errors: readonly BulkInsertError[]};

export const okBulkInsert = (): BulkInsertResult => ({ok: true});

export const errBulkInsert = (
  errors: readonly BulkInsertError[],
): BulkInsertResult => ({ok: false, errors});
