/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const CHANGE_OPERATION = {
  None: 'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;

export type ChangeOperation =
  (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION];

export const CHANGE_STATUS = {
  Staged: 'STAGED',
  Unstaged: 'UNSTAGED',
} as const;

export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];
