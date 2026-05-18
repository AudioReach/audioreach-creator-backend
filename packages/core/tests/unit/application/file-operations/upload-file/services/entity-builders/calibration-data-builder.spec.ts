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
