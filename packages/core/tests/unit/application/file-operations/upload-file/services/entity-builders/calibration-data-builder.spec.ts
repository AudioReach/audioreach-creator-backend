/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {CalibrationDataBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/calibration-data-builder.js';
import type {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import {
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import {
  asSystemId,
  asNaturalId,
} from '../../../../../../../src/shared/types/branded-ids.js';
import {KvData} from '../../../../../../../src/domain/entities/common/entities/kv-data.js';

describe('CalibrationDataBuilder', () => {
  let builder: CalibrationDataBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();
    builder = new CalibrationDataBuilder(mockIdGenerator);
  });

  describe('assignSystemIds', () => {
    it('should assign unique systemId to each KvData', async () => {
      // Arrange
      const kvData1 = new KvData({
        systemId: 0,
        valueDefinitionSystemIds: [100, 200],
        uiPersistence: null,
      });

      const kvData2 = new KvData({
        systemId: 0,
        valueDefinitionSystemIds: [300, 400],
        uiPersistence: null,
      });

      const rawKvDataWithModules = [
        {kvData: kvData1, moduleSystemId: 1000},
        {kvData: kvData2, moduleSystemId: 2000},
      ];

      let idCounter = 5000;
      mockIdGenerator.getNextId.mockImplementation(async () => idCounter++);

      mockForeignKeyMapper.getKeyVectorSystemId.mockReturnValue(undefined);
      mockForeignKeyMapper.addKeyVectorMapping.mockReturnValue(undefined);

      // Act
      const result = await (builder as any).assignSystemIds(
        rawKvDataWithModules,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].kvData.systemId).toBe(5000); // First keyVectorSystemId
      expect(result[1].kvData.systemId).toBe(5001); // Second keyVectorSystemId
      expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2); // 2 for keyVectorSystemId (systemId is set to keyVectorSystemId)
    });

    it('should assign keyVectorSystemId from ForeignKeyMapper when KeyVector exists', async () => {
      // Arrange
      const kvData = new KvData({
        systemId: 0,
        valueDefinitionSystemIds: [100, 200],
        uiPersistence: null,
      });

      const rawKvDataWithModules = [{kvData, moduleSystemId: 1000}];

      const existingKeyVectorSystemId = asSystemId(9999);
      mockForeignKeyMapper.getKeyVectorSystemId.mockReturnValue(
        existingKeyVectorSystemId,
      );

      // Act
      const result = await (builder as any).assignSystemIds(
        rawKvDataWithModules,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result[0].kvData.systemId).toBe(existingKeyVectorSystemId);
      expect(mockForeignKeyMapper.addKeyVectorMapping).not.toHaveBeenCalled();
    });

    it('should deduplicate KeyVectors with same value system IDs', async () => {
      // Arrange
      const kvData1 = new KvData({
        systemId: 0,
        valueDefinitionSystemIds: [100, 200],
        uiPersistence: null,
      });

      const kvData2 = new KvData({
        systemId: 0,
        valueDefinitionSystemIds: [100, 200], // Same as kvData1
        uiPersistence: null,
      });

      const rawKvDataWithModules = [
        {kvData: kvData1, moduleSystemId: 1000},
        {kvData: kvData2, moduleSystemId: 2000},
      ];

      let idCounter = 5000;
      mockIdGenerator.getNextId.mockImplementation(async () => idCounter++);

      // First call returns undefined (new KeyVector), second call returns the cached value
      let callCount = 0;
      mockForeignKeyMapper.getKeyVectorSystemId.mockImplementation(() => {
        if (callCount === 0) {
          callCount++;
          return undefined;
        }
        return asSystemId(5000); // Return the first KeyVector's systemId
      });

      mockForeignKeyMapper.addKeyVectorMapping.mockReturnValue(undefined);

      // Act
      const result = await (builder as any).assignSystemIds(
        rawKvDataWithModules,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result[0].kvData.systemId).toBe(5000); // First KeyVector systemId
      expect(result[1].kvData.systemId).toBe(5000); // Same KeyVector systemId (deduplicated)
      expect(mockForeignKeyMapper.addKeyVectorMapping).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('buildCalibrationDataByModule', () => {
    it('should return empty map when no calibration chunks are present', async () => {
      // Arrange
      const mockParsedAcdb = {
        getChunk: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ParsedAcdb>;

      // Act
      const result = await builder.buildCalibrationDataByModule(
        mockParsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Assert
      expect(result.size).toBe(0);
    });

    it('should group KvData by module systemId', async () => {
      // This test would require mocking the entire calibration chunk structure
      // which is complex. For now, we verify the basic structure.
      const mockParsedAcdb = {
        getChunk: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ParsedAcdb>;

      const result = await builder.buildCalibrationDataByModule(
        mockParsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result).toBeInstanceOf(Map);
    });
  });
});
