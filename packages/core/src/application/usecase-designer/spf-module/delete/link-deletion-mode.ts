/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const LINK_DELETION_MODE = {
  Full: 'full',
  SegmentOnly: 'segmentOnly',
} as const;

export type LinkDeletionMode =
  (typeof LINK_DELETION_MODE)[keyof typeof LINK_DELETION_MODE];

export function isLinkDeletionMode(value: string): value is LinkDeletionMode {
  return Object.values(LINK_DELETION_MODE).includes(value as LinkDeletionMode);
}
