/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {LogLevel} from '@arc/core';
import {
  LOG_LEVEL_ORDER,
  logLevelsAtOrAbove,
} from '../../../src/queries/log-level-order.js';

describe('LOG_LEVEL_ORDER', () => {
  it('lists every level once', () => {
    expect([...LOG_LEVEL_ORDER].sort()).toEqual(Object.values(LogLevel).sort());
  });
});

describe('logLevelsAtOrAbove', () => {
  it('returns the level and every more severe one, least severe first', () => {
    expect(logLevelsAtOrAbove(LogLevel.Warn)).toEqual([
      LogLevel.Warn,
      LogLevel.Error,
      LogLevel.Critical,
    ]);
  });

  it('returns every level for VERBOSE and only CRITICAL for CRITICAL', () => {
    expect(logLevelsAtOrAbove(LogLevel.Verbose)).toEqual(LOG_LEVEL_ORDER);
    expect(logLevelsAtOrAbove(LogLevel.Critical)).toEqual([LogLevel.Critical]);
  });
});
