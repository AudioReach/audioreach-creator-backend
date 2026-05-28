/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import type {ForeignKeyMapper} from '../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';

/**
 * Creates a mock ForeignKeyMapper instance with all methods stubbed
 *
 * By default, all methods are jest.fn() with no return values.
 * This allows tests to configure specific behaviors as needed.
 *
 * @returns A fully mocked ForeignKeyMapper instance
 *
 * @example
 * ```typescript
 * let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
 *
 * beforeEach(() => {
 *   mockForeignKeyMapper = createMockForeignKeyMapper();
 * });
 * ```
 */
export function createMockForeignKeyMapper(): jest.Mocked<ForeignKeyMapper> {
  return {
    // Key Definition mappings
    addKeyDefinitionMapping: jest.fn(),
    getKeySystemId: jest.fn(),
    hasKeyMapping: jest.fn(),
    getAllKeyMappings: jest.fn(),

    // Value Definition mappings
    addValueDefinitionMapping: jest.fn(),
    getValueSystemId: jest.fn(),
    hasValueMapping: jest.fn(),
    getValueMappingsForKey: jest.fn(),

    // Subgraph mappings
    addSubgraphMapping: jest.fn(),
    getSubgraphSystemId: jest.fn(),

    // Container mappings
    addContainerMapping: jest.fn(),
    getContainerSystemId: jest.fn(),

    // Module Definition mappings
    addModuleDefinitionMapping: jest.fn(),
    getModuleDefinitionSystemId: jest.fn(),

    // Processor Definition mappings
    addProcessorDefinitionMapping: jest.fn(),
    getProcessorDefinitionSystemId: jest.fn(),

    // Container Type mappings
    addContainerTypeMapping: jest.fn(),
    getContainerTypeSystemId: jest.fn(),

    // Property Definition mappings
    addSubgraphPropertyDefinitionMapping: jest.fn(),
    getSubgraphPropertyDefinitionSystemId: jest.fn(),
    addContainerPropertyDefinitionMapping: jest.fn(),
    getContainerPropertyDefinitionSystemId: jest.fn(),

    // Parameter Definition mappings
    addParamDefinitionMapping: jest.fn(),
    getParamDefinitionSystemId: jest.fn(),
    getModuleParamSystemIds: jest.fn(),

    // SPF Module mappings
    addSpfModuleMapping: jest.fn(),
    getSpfModuleSystemId: jest.fn(),

    // Module instance to subgraph mappings
    addModuleInstanceSubgraphMapping: jest.fn(),
    getSubgraphSystemIdForModuleInstance: jest.fn(),

    // Module Port mappings
    addDataPortMapping: jest.fn(),
    addControlPortMapping: jest.fn(),
    getModuleInputPortSystemIds: jest.fn(),
    getModuleOutputPortSystemIds: jest.fn(),
    getInputPortSystemId: jest.fn(),
    getOutputPortSystemId: jest.fn(),
    getModuleControlPortSystemIds: jest.fn(),
    getControlPortSystemId: jest.fn(),

    // Link mappings
    addDataLinkMapping: jest.fn(),
    getDataLinkSystemId: jest.fn(),
    getControlLinkSystemId: jest.fn(),

    // Utility methods
    clear: jest.fn(),
    getStats: jest.fn(),
  } as unknown as jest.Mocked<ForeignKeyMapper>;
}

/**
 * Creates a mock ForeignKeyMapper instance with optional overrides
 *
 * @param overrides - Partial ForeignKeyMapper implementation to override default mocks
 * @returns A fully mocked ForeignKeyMapper instance with custom overrides applied
 *
 * @example
 * ```typescript
 * const mockForeignKeyMapper = createMockForeignKeyMapperWithOverrides({
 *   getKeySystemId: jest.fn().mockReturnValue(100),
 *   hasKeyMapping: jest.fn().mockReturnValue(true),
 * });
 * ```
 */
export function createMockForeignKeyMapperWithOverrides(
  overrides?: Partial<jest.Mocked<ForeignKeyMapper>>,
): jest.Mocked<ForeignKeyMapper> {
  return {
    ...createMockForeignKeyMapper(),
    ...overrides,
  } as jest.Mocked<ForeignKeyMapper>;
}
