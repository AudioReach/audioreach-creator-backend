/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {Logger} from '../../src/shared/types/logger.interface.js';

/**
 * Creates a mock Logger instance with all methods stubbed using jest.fn()
 *
 * @returns A fully mocked Logger instance
 *
 * @example
 * ```typescript
 * let mockLogger: jest.Mocked<Logger>;
 *
 * beforeEach(() => {
 *   mockLogger = createMockLogger();
 * });
 * ```
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    logVerbose: jest.fn(),
    logInfo: jest.fn(),
    logDebug: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
    logCritical: jest.fn(),
  };
}

/**
 * Creates a mock Logger instance with optional overrides for specific methods
 *
 * @param overrides - Partial Logger implementation to override default mocks
 * @returns A fully mocked Logger instance with custom overrides applied
 *
 * @example
 * ```typescript
 * const mockLogger = createMockLoggerWithOverrides({
 *   logError: jest.fn().mockImplementation((data) => {
 *     console.error('Custom error handler:', data.msg);
 *   }),
 * });
 * ```
 */
export function createMockLoggerWithOverrides(
  overrides?: Partial<jest.Mocked<Logger>>,
): jest.Mocked<Logger> {
  return {
    ...createMockLogger(),
    ...overrides,
  };
}
