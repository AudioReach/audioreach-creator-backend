/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const MDF_MODULE_TYPE = {
  WRClient: 'WR_CLIENT',
  WREP: 'WREP',
  RDClient: 'RD_CLIENT',
  RDEP: 'RDEP',
} as const;

export type MdfModuleType =
  (typeof MDF_MODULE_TYPE)[keyof typeof MDF_MODULE_TYPE];
