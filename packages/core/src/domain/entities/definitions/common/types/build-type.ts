/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const MODULE_BUILT_TYPE = {
  Static: 'STATIC',
  Dynamic: 'DYNAMIC',
  Stub: 'STUB',
} as const;

export type ModuleBuildType =
  (typeof MODULE_BUILT_TYPE)[keyof typeof MODULE_BUILT_TYPE];
