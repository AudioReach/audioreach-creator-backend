/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {IdGenerationPort} from '../../src/application/ports/id-generation/id-generation.port.js';

/**
 * Creates a mock IdGenerationPort instance with all methods stubbed
 *
 * By default:
 * - getNextId returns a resolved promise with value 1
 * - reserveBlock returns a resolved promise with value 1
 * - persistLastUsedId returns a resolved promise with void
 *
 * @returns A fully mocked IdGenerationPort instance
 *
 * @example
 * ```typescript
 * let mockIdGenerator: jest.Mocked<IdGenerationPort>;
 *
 * beforeEach(() => {
 *   mockIdGenerator = createMockIdGenerator();
 * });
 * ```
 */
export function createMockIdGenerator(): jest.Mocked<IdGenerationPort> {
  return {
    getNextId: jest.fn().mockResolvedValue(1),
    reserveBlock: jest.fn().mockResolvedValue(1),
    persistLastUsedId: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock IdGenerationPort instance with optional overrides
 *
 * @param overrides - Partial IdGenerationPort implementation to override default mocks
 * @returns A fully mocked IdGenerationPort instance with custom overrides applied
 *
 * @example
 * ```typescript
 * let idCounter = 100;
 * const mockIdGenerator = createMockIdGeneratorWithOverrides({
 *   getNextId: jest.fn().mockImplementation(async () => idCounter++),
 * });
 * ```
 */
export function createMockIdGeneratorWithOverrides(
  overrides?: Partial<jest.Mocked<IdGenerationPort>>,
): jest.Mocked<IdGenerationPort> {
  return {
    ...createMockIdGenerator(),
    ...overrides,
  };
}
