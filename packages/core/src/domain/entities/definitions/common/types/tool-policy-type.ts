/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const TOOL_POLICY = {
  Unknown: 'UNKNOWN',
  NoSupport: 'NO_SUPPORT',
  Calibration: 'CALIBRATION',
  Rtc: 'RTC',
  RtcReadonly: 'RTC_READONLY',
  Rtm: 'RTM',
} as const;

export type ToolPolicy = (typeof TOOL_POLICY)[keyof typeof TOOL_POLICY];
