/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PORT_IO_TYPE = {
  Input: 'INPUT',
  Output: 'OUTPUT',
  InputOutput: 'INPUT_OUTPUT', // subsystem port: outfacing=Input, infacing=Output
  OutputInput: 'OUTPUT_INPUT', // subsystem port: outfacing=Output, infacing=Input
} as const;

export type PortIoType = (typeof PORT_IO_TYPE)[keyof typeof PORT_IO_TYPE];
