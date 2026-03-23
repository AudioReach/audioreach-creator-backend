/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Arc element policy values
 *
 * Defines the visibility and access control policy for configuration elements.
 * Used to control which elements are shown to different user types or in different modes.
 */
export const ELEMENT_POLICY = {
  Hidden: 'HIDDEN',
  Basic: 'BASIC',
  Advanced: 'ADVANCED',
} as const;

export type ElementPolicy =
  (typeof ELEMENT_POLICY)[keyof typeof ELEMENT_POLICY];
