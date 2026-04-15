/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Test Helpers - Common Mock Factories
 *
 * This module provides reusable mock factories for common interfaces used across tests.
 * Using these factories reduces boilerplate and ensures consistency in test setup.
 *
 * @example
 * ```typescript
 * import {
 *   createMockLogger,
 *   createMockIdGenerator,
 *   createMockWorkerPool
 * } from '../../helpers';
 *
 * let mockLogger: jest.Mocked<Logger>;
 * let mockIdGenerator: jest.Mocked<IdGenerationPort>;
 *
 * beforeEach(() => {
 *   mockLogger = createMockLogger();
 *   mockIdGenerator = createMockIdGenerator();
 * });
 * ```
 */

// Logger mocks
export {
  createMockLogger,
  createMockLoggerWithOverrides,
} from './mock-logger.js';

// ID Generator mocks
export {
  createMockIdGenerator,
  createMockIdGeneratorWithOverrides,
} from './mock-id-generator.js';

// Worker Pool mocks
export {
  createMockWorkerPool,
  createMockWorkerPoolWithOverrides,
} from './mock-worker-pool.js';

// Foreign Key Mapper mocks
export {
  createMockForeignKeyMapper,
  createMockForeignKeyMapperWithOverrides,
} from './mock-foreign-key-mapper.js';
