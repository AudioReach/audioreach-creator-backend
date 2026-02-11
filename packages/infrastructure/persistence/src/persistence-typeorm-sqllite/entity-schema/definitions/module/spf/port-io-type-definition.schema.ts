/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PortIoType = {
  Input: 'Input',
  Output: 'Output',
} as const;

export type PortIoType = (typeof PortIoType)[keyof typeof PortIoType];
