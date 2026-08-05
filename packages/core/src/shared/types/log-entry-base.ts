/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface LogEntryBase {
  msg: string;
  description: string;
  source: string;
  projectId?: string;
  component: string;
  tag: string;
  error?: string;
}
