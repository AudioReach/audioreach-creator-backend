/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Present in the header JSON of every AWSP version — used for version probing. */
export interface WorkspaceFileVersion {
  major: number;
  minor: number;
}

/** String key derived from a version — used as the parser registry key. */
export type AwspVersionKey = `${number}.${number}`;

export function awspVersionKey(v: WorkspaceFileVersion): AwspVersionKey {
  return `${v.major}.${v.minor}`;
}
