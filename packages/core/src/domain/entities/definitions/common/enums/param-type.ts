/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PARAM_TYPE = {
  None: 'NONE',
  Shared: 'SHARED',
  GlobalShared: 'GLOBAL_SHARED',
} as const;

export type ParamType = (typeof PARAM_TYPE)[keyof typeof PARAM_TYPE];
