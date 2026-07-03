/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const BUILD_TYPE = {
  Static: 'STATIC',
  Dynamic: 'DYNAMIC',
  Stub: 'STUB',
} as const;

export type BuildType = (typeof BUILD_TYPE)[keyof typeof BUILD_TYPE];
