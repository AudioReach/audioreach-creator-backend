/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface LogEntryBase {
  /** Stable operation identifier used for grouping related log entries */
  msg: string;
  /** Detailed, contextual description of the logged event */
  description: string;
  /** Origin of the log entry, such as a client or the server */
  source: string;
  /** Project or workspace associated with the log entry */
  projectId?: string;
  /** Component, service, or module that emitted the log entry */
  component: string;
  /** Feature or category used to group log entries */
  tag: string;
  /** Serialized error details when the entry represents a failure */
  error?: string;
}
