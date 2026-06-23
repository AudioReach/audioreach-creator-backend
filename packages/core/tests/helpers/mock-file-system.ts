/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {FileSystemPort} from '../../src/application/ports/file-system/file-system.port.js';

/**
 * Creates a mock FileSystemPort instance with all methods stubbed using jest.fn()
 *
 * @returns A fully mocked FileSystemPort instance
 *
 * @example
 * ```typescript
 * let mockFileSystem: jest.Mocked<FileSystemPort>;
 *
 * beforeEach(() => {
 *   mockFileSystem = createMockFileSystem();
 * });
 * ```
 */
export function createMockFileSystem(): jest.Mocked<FileSystemPort> {
  return {
    readAll: jest.fn(),
    parseBlock: jest.fn(),
    exists: jest.fn(),
    joinPath: jest.fn(),
    dirname: jest.fn(),
    basename: jest.fn(),
    deleteDirectory: jest.fn(),
    unzip: jest.fn(),
    zipToBuffer: jest
      .fn<() => Promise<Uint8Array>>()
      .mockResolvedValue(
        new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]),
      ),
  };
}

/**
 * Creates a mock FileSystemPort instance with optional overrides for specific methods
 *
 * @param overrides - Partial FileSystemPort implementation to override default mocks
 * @returns A fully mocked FileSystemPort instance with custom overrides applied
 *
 * @example
 * ```typescript
 * const mockFileSystem = createMockFileSystemWithOverrides({
 *   readAll: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
 *   exists: jest.fn().mockResolvedValue(true),
 * });
 * ```
 */
export function createMockFileSystemWithOverrides(
  overrides?: Partial<jest.Mocked<FileSystemPort>>,
): jest.Mocked<FileSystemPort> {
  return {
    ...createMockFileSystem(),
    ...overrides,
  };
}
