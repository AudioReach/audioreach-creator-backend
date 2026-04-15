/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {WorkerPoolPort} from '../../src/application/ports/worker/worker-pool.port.js';

/**
 * Creates a mock WorkerPoolPort instance with all methods stubbed
 *
 * By default:
 * - isThreadingSupported returns false
 * - executeTask returns a resolved promise with {success: true, data: undefined}
 * - executeParallel returns a resolved promise with empty array
 * - dispose returns a resolved promise with void
 *
 * @returns A fully mocked WorkerPoolPort instance
 *
 * @example
 * ```typescript
 * let mockWorkerPool: jest.Mocked<WorkerPoolPort>;
 *
 * beforeEach(() => {
 *   mockWorkerPool = createMockWorkerPool();
 * });
 * ```
 */
export function createMockWorkerPool(): jest.Mocked<WorkerPoolPort> {
  return {
    isThreadingSupported: jest.fn().mockReturnValue(false),
    executeTask: jest.fn().mockResolvedValue({success: true, data: undefined}),
    executeParallel: jest.fn().mockResolvedValue([]),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock WorkerPoolPort instance with optional overrides
 *
 * @param overrides - Partial WorkerPoolPort implementation to override default mocks
 * @returns A fully mocked WorkerPoolPort instance with custom overrides applied
 *
 * @example
 * ```typescript
 * const mockWorkerPool = createMockWorkerPoolWithOverrides({
 *   isThreadingSupported: jest.fn().mockReturnValue(true),
 *   executeParallel: jest.fn().mockResolvedValue([
 *     {success: true, data: {result: 'task1'}},
 *     {success: true, data: {result: 'task2'}},
 *   ]),
 * });
 * ```
 */
export function createMockWorkerPoolWithOverrides(
  overrides?: Partial<jest.Mocked<WorkerPoolPort>>,
): jest.Mocked<WorkerPoolPort> {
  return {
    ...createMockWorkerPool(),
    ...overrides,
  };
}
