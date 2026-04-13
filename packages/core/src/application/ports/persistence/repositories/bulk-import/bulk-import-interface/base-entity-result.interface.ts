/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const INSERT_STATUS = {
  unknown: 'UNKNOWN',
  success: 'SUCCESS',
  failed: 'FAILED',
} as const;

export type InsertStatus = (typeof INSERT_STATUS)[keyof typeof INSERT_STATUS];
