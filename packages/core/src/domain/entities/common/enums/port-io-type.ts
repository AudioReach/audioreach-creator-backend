/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PORT_IO_TYPE = {
  Input: 'Input',
  Output: 'Output',
} as const;

export type PortIoType = (typeof PORT_IO_TYPE)[keyof typeof PORT_IO_TYPE];
