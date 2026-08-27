/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogLevel} from '../../../../../shared/types/logger.interface.js';
import type {LogEntryBase} from '../../../../../shared/types/log-entry-base.js';

export interface LogEntryReadModel extends LogEntryBase {
  /** Database-generated log entry identifier */
  readonly id: number;
  /** Severity of the log entry */
  readonly level: LogLevel;
  /** Serialized timestamp returned by the logging query service */
  readonly timestamp: string;
}
