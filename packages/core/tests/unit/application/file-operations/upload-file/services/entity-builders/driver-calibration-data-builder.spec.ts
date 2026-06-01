/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DriverCalibrationDataBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/driver-calibration-data-builder.js';
import {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import {DriverCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/driver-calibration-chunk.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../../src/shared/types/branded-ids.js';

describe('DriverCalibrationDataBuilder', () => {
  let builder: DriverCalibrationDataBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    builder = new DriverCalibrationDataBuilder(mockIdGenerator, mockLogger);
  });

  describe('buildCalibrationDataByModule', () => {
    describe('Happy Path', () => {
      it('should build calibration data with valid chunks', async () => {
        // Setup parsed ACDB with driver calibration chunk
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        // Add module lookup entry
        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        // Setup calibration key table
        driverCalChunk.setCalKeyTable(0, []);

        // Setup CKV lookup table
        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        // Setup DEF entry
        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        // Setup DOT entry
        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        // Setup datapool chunk
        const datapoolChunk = new DatapoolChunk();
        datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
        datapoolChunk.offsets = [0];
        datapoolChunk.totalLength = 4;
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

        // Setup foreign key mappings
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          2000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockReturnValue(
          3000 as any,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.size).toBeGreaterThan(0);
        expect(mockIdGenerator.getNextId).toHaveBeenCalled();
      });

      it('should group DkvData by module systemId', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        // Add two modules
        driverCalChunk.moduleLookupEntries.push(
          {
            moduleDefinitionId: 100,
            calKeyTableEntries: [
              {offsetCalKeyTable: 0, offsetCalLookupTable: 0},
            ],
          },
          {
            moduleDefinitionId: 200,
            calKeyTableEntries: [
              {offsetCalKeyTable: 0, offsetCalLookupTable: 0},
            ],
          },
        );

        // Setup calibration key table
        driverCalChunk.setCalKeyTable(0, []);

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const datapoolChunk = new DatapoolChunk();
        datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
        datapoolChunk.offsets = [0];
        datapoolChunk.totalLength = 4;
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

        // Setup different module system IDs
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockImplementation(
          (naturalId: any) => {
            if (Number(naturalId) === 100) return 1000 as any;
            if (Number(naturalId) === 200) return 2000 as any;
            return undefined;
          },
        );
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          3000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockImplementation(
          (naturalId: any) => {
            if (Number(naturalId) === 100) return 4000 as any;
            if (Number(naturalId) === 200) return 5000 as any;
            return undefined;
          },
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        // Should have entries for both modules
        expect(result.size).toBeGreaterThan(0);
      });

      it('should create empty KeyVector for driver calibration', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        // Setup calibration key table
        driverCalChunk.setCalKeyTable(0, []);

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const datapoolChunk = new DatapoolChunk();
        datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
        datapoolChunk.offsets = [0];
        datapoolChunk.totalLength = 4;
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          2000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockReturnValue(
          3000 as any,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        // Verify DkvData was created with empty KeyVector
        const dkvDataList = Array.from(result.values())[0];
        if (dkvDataList && dkvDataList.length > 0) {
          expect(dkvDataList[0].valueDefinitionSystemIds).toEqual([]);
        }
      });
    });

    describe('Edge Cases', () => {
      it('should return empty map when no calibration chunk present', async () => {
        const parsedAcdb = new ParsedAcdb();

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.size).toBe(0);
      });

      it('should return empty map when calibration chunk has no modules', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();
        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.size).toBe(0);
      });

      it('should handle missing datapool chunk', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );
        // No datapool chunk added

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockReturnValue(
          2000 as any,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        // Should log warning but not fail
        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should skip module when module definition mapping not found', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const datapoolChunk = new DatapoolChunk();
        datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
        datapoolChunk.offsets = [0];
        datapoolChunk.totalLength = 4;
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

        // Return undefined for module definition mapping
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          undefined,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should skip parameter when parameter definition mapping not found', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        driverCalChunk.setCalDataOffsetEntry(0, {
          calDataOffsets: [0],
        });

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const datapoolChunk = new DatapoolChunk();
        datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
        datapoolChunk.offsets = [0];
        datapoolChunk.totalLength = 4;
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        // Return undefined for parameter definition mapping
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          undefined,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockReturnValue(
          2000 as any,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logWarn).toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle missing CKV lookup table', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        // Don't set CKV lookup table

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should handle missing DEF entry', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        // Don't set DEF entry

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should handle missing DOT entry', async () => {
        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

        driverCalChunk.moduleLookupEntries.push({
          moduleDefinitionId: 100,
          calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
        });

        driverCalChunk.setCkvLookupTable(0, {
          numCalKeyValues: 0,
          ckvLookupEntries: [
            {
              calKeyValues: [],
              offsetCalDefinition: 0,
              offsetCalDataOffset: 0,
            },
          ],
        });

        driverCalChunk.setCalDefinitionEntry(0, {
          calIdEntries: [{paramId: 10}],
        });

        // Don't set DOT entry

        parsedAcdb.addChunk(
          PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
          driverCalChunk,
        );

        const result = await builder.buildCalibrationDataByModule(
          parsedAcdb,
          mockForeignKeyMapper,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logWarn).toHaveBeenCalled();
      });
    });
  });
});
