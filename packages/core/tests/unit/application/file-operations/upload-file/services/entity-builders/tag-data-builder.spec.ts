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
  createMockForeignKeyMapperWithOverrides,
  createMockForeignKeyMapper,
  createMockLogger,
  createMockIdGeneratorWithOverrides,
} from '../../../../../../helpers/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../../src/shared/types/branded-ids.js';

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

    it('should produce one KvData with two parameterPayloads when one module has two params sharing the same key vector', async () => {
      // Arrange
      const MODULE_INSTANCE_ID = 10;
      const MODULE_SYSTEM_ID = asSystemId(100);
      const MODULE_DEF_SYSTEM_ID = asSystemId(200);
      const PARAM_ID_A = 1;
      const PARAM_ID_B = 2;
      const PARAM_SYSTEM_ID_A = asSystemId(301);
      const PARAM_SYSTEM_ID_B = asSystemId(302);
      const TAG_ID = 42;
      const TAG_DEF_SYSTEM_ID = asSystemId(500);
      const TAG_DEF_OFFSET = 0;
      const TAG_DOT_OFFSET = 100;
      const DATA_OFFSET_A = 0;
      const DATA_OFFSET_B = 1;
      const VALUE_KEY_ID = 7;
      const VALUE_SYSTEM_ID = asSystemId(700);

      const payloadA = new Uint8Array([0xaa]);
      const payloadB = new Uint8Array([0xbb]);

      // One tag LUT table with one key vector entry pointing at two (moduleId, paramId) pairs
      const tagDataDefEntry = {
        taggedIdEntries: [
          {moduleInstanceId: MODULE_INSTANCE_ID, paramId: PARAM_ID_A},
          {moduleInstanceId: MODULE_INSTANCE_ID, paramId: PARAM_ID_B},
        ],
      };
      const tagDataDotEntry = {
        taggedDataOffsets: [DATA_OFFSET_A, DATA_OFFSET_B],
      };

      const mockTagDataChunk = {
        tagIndexEntries: [
          {subgraphId: 1, tagId: TAG_ID, offsetTagDataTable: 0},
        ],
        getTagLutDataTable: jest.fn().mockReturnValue({
          tagKeyVectorEntries: [
            {
              tagKeyValues: [VALUE_KEY_ID],
              offsetTagDataDEF: TAG_DEF_OFFSET,
              offsetTagDataDOT: TAG_DOT_OFFSET,
            },
          ],
        }),
        getTagDataDefEntry: jest.fn().mockReturnValue(tagDataDefEntry),
        getTagDataDotEntry: jest.fn().mockReturnValue(tagDataDotEntry),
      };

      const mockDatapoolChunk = {
        getDataAtOffset: jest.fn().mockImplementation((offset: number) => {
          if (offset === DATA_OFFSET_A) return payloadA;
          if (offset === DATA_OFFSET_B) return payloadB;
          return null;
        }),
      };

      const mockParsedAcdb = {
        getChunk: jest.fn().mockImplementation((type: string) => {
          if (type === 'TAG_DATA') return mockTagDataChunk;
          if (type === 'DATAPOOL') return mockDatapoolChunk;
          return undefined;
        }),
      } as unknown as jest.Mocked<ParsedAcdb>;

      const mockFkMapper = createMockForeignKeyMapperWithOverrides({
        getTagDefinitionSystemId: jest.fn().mockReturnValue(TAG_DEF_SYSTEM_ID),
        getSpfModuleSystemId: jest.fn().mockReturnValue(MODULE_SYSTEM_ID),
        getValueSystemId: jest.fn().mockReturnValue(VALUE_SYSTEM_ID),
        getParamDefinitionSystemId: jest
          .fn()
          .mockImplementation((_modDefId: unknown, paramNaturalId: unknown) => {
            if (paramNaturalId === PARAM_ID_A) return PARAM_SYSTEM_ID_A;
            if (paramNaturalId === PARAM_ID_B) return PARAM_SYSTEM_ID_B;
            return undefined;
          }),
      } as unknown as Partial<jest.Mocked<ForeignKeyMapper>>);

      const instanceToDefinitionMap = new Map([
        [asNaturalId(MODULE_INSTANCE_ID), MODULE_DEF_SYSTEM_ID],
      ]);

      const awspTagDefinition = {
        id: TAG_ID,
        supportedKeys: [{id: VALUE_KEY_ID}],
      };

      let idCounter = 1000;
      const mockIdGen = createMockIdGeneratorWithOverrides({
        getNextId: jest.fn().mockImplementation(async () => idCounter++),
      });
      const localBuilder = new TagDataBuilder(mockIdGen, mockLogger);

      // Act
      const result = await localBuilder.buildTagDataByModule(
        mockParsedAcdb,
        mockFkMapper,
        TEST_FILE_SYSTEM_ID,
        [awspTagDefinition] as any,
        instanceToDefinitionMap,
      );

      // Assert: one module entry
      expect(result.size).toBe(1);
      const tagDataList = result.get(MODULE_SYSTEM_ID)!;
      expect(tagDataList).toHaveLength(1);

      const tagData = tagDataList[0];
      expect(tagData.tagDefinitionSystemId).toBe(TAG_DEF_SYSTEM_ID);

      // One KvData (not two) despite two params
      expect(tagData.tkvs).toHaveLength(1);
      const kvData = tagData.tkvs[0];

      // Both params are attached as parameterPayloads on that single KvData
      expect(kvData.parameterPayloads).toHaveLength(2);
      const paramIds = kvData.parameterPayloads.map(
        p => p.paramDefintionSystemId,
      );
      expect(paramIds).toContain(PARAM_SYSTEM_ID_A);
      expect(paramIds).toContain(PARAM_SYSTEM_ID_B);
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
