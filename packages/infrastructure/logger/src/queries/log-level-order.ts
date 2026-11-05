/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {LogLevel} from '@arc/core';

/** Every level, least severe first. */
export const LOG_LEVEL_ORDER: ReadonlyArray<LogLevel> = [
  LogLevel.Verbose,
  LogLevel.Debug,
  LogLevel.Info,
  LogLevel.Warn,
  LogLevel.Error,
  LogLevel.Critical,
];

/** `minLevel` and every more severe level, least severe first. */
export function logLevelsAtOrAbove(minLevel: LogLevel): LogLevel[] {
  return LOG_LEVEL_ORDER.slice(LOG_LEVEL_ORDER.indexOf(minLevel));
}
