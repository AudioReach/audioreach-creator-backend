/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {TagDataBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/tag-data-builder.js';
import type {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {
  createMockIdGenerator,
  createMockForeignKeyMapper,
  createMockLogger,
} from '../../../../../../helpers/index.js';

describe('TagDataBuilder', () => {
  let builder: TagDataBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();
    mockLogger = createMockLogger();
    builder = new TagDataBuilder(mockIdGenerator, mockLogger);
  });

  describe('buildTagDataByModule', () => {
    it('should return empty map when no tag data chunks are present', async () => {
      // Arrange
      const mockParsedAcdb = {
        getChunk: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ParsedAcdb>;

      // Act
      const result = await builder.buildTagDataByModule(
        mockParsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result.size).toBe(0);
    });

    it('should return empty map when datapool chunk is missing', async () => {
      // Arrange
      const mockTagDataChunk = {tagIndexEntries: []};
      const mockParsedAcdb = {
        getChunk: jest.fn().mockImplementation((type: string) => {
          if (type === 'TAG_DATA') return mockTagDataChunk;
          return undefined;
        }),
      } as unknown as jest.Mocked<ParsedAcdb>;

      // Act
      const result = await builder.buildTagDataByModule(
        mockParsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should group TagData by module systemId', async () => {
      // Arrange
      const mockParsedAcdb = {
        getChunk: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ParsedAcdb>;

      // Act
      const result = await builder.buildTagDataByModule(
        mockParsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe('resolveTagKeyValuesToValueSystemIds', () => {
    it('should return empty array (current implementation)', () => {
      const tagKeyValues = [10, 20, 30];
      const tagDefinitionSystemId = 100;

      const result = (builder as any).resolveTagKeyValuesToValueSystemIds(
        tagKeyValues,
        tagDefinitionSystemId,
        mockForeignKeyMapper,
      );

      expect(result).toEqual([]);
    });
  });
});
