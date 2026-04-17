/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type BulkInsertResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly message: string};

export const okBulkInsert = (): BulkInsertResult => ({ok: true});

export const errBulkInsert = (message: string): BulkInsertResult => ({
  ok: false,
  message,
});
