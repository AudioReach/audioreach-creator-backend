/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const USECASE_TYPE = {
  Ec: 'EC',
  Linked: 'LINKED',
  Island: 'ISLAND',
} as const;

export type UsecaseType = (typeof USECASE_TYPE)[keyof typeof USECASE_TYPE];
