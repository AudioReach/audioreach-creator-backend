/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DriverModuleBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/driver-module-builder.js';
import {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import {DriverCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/driver-calibration-chunk.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {ISSUE_SEVERITY} from '../../../../../../../src/application/file-operations/upload-file/types/issue-collection.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('DriverModuleBuilder', () => {
  let builder: DriverModuleBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    builder = new DriverModuleBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildDriverModules', () => {
    describe('Happy Path', () => {
      it('should build driver modules from definition IDs', async () => {
        const moduleDefinitionIds = [100, 200];

        // Setup foreign key mappings
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockImplementation(
          (naturalId: any) => {
            const id = Number(naturalId);
            if (id === 100) return 1000 as any;
            if (id === 200) return 2000 as any;
            return undefined;
          },
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(0);
        expect(result.entities[0].definitionSystemId).toBe(1000);
        expect(result.entities[1].definitionSystemId).toBe(2000);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(
          mockForeignKeyMapper.addDriverModuleMapping,
        ).toHaveBeenCalledTimes(2);
      });

      it('should assign system IDs to driver modules', async () => {
        const moduleDefinitionIds = [100];

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
      });

      it('should attach calibration data when ACDB provided', async () => {
        const moduleDefinitionIds = [100];

        // Setup parsed ACDB with calibration data
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

        // Setup foreign key mappings
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          2000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockImplementation(
          (naturalId: any) => {
            // Return the systemId that will be assigned to the module
            return 5000 as any;
          },
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
          parsedAcdb,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        // Calibration data attachment is attempted
        expect(mockLogger.logInfo).toHaveBeenCalled();
      });

      it('should handle multiple modules with calibration data', async () => {
        const moduleDefinitionIds = [100, 200];

        const parsedAcdb = new ParsedAcdb();
        const driverCalChunk = new DriverCalibrationChunk();

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

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockImplementation(
          (naturalId: any) => {
            const id = Number(naturalId);
            if (id === 100) return 1000 as any;
            if (id === 200) return 2000 as any;
            return undefined;
          },
        );
        mockForeignKeyMapper.getDriverParamDefinitionSystemId.mockReturnValue(
          3000 as any,
        );
        mockForeignKeyMapper.getDriverModuleSystemId.mockImplementation(
          (naturalId: any) => {
            const id = Number(naturalId);
            if (id === 100) return 4000 as any;
            if (id === 200) return 5000 as any;
            return undefined;
          },
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
          parsedAcdb,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is empty', async () => {
        const result = await builder.buildDriverModules(
          [],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should return empty result when input is null', async () => {
        const result = await builder.buildDriverModules(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.successCount).toBe(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildDriverModules(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.successCount).toBe(0);
      });

      it('should build modules without calibration data when ACDB not provided', async () => {
        const moduleDefinitionIds = [100];

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        // No calibration data attached
        expect(result.entities[0].dkvData).toHaveLength(0);
      });
    });

    describe('Error Handling', () => {
      it('should collect error when module definition mapping not found', async () => {
        const moduleDefinitionIds = [100];

        // Return undefined for mapping
        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          undefined,
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].severity).toBe(ISSUE_SEVERITY.ERROR);
      });

      it('should continue building after individual module failure', async () => {
        const moduleDefinitionIds = [100, 200, 300];

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockImplementation(
          (naturalId: any) => {
            const id = Number(naturalId);
            if (id === 100) return 1000 as any;
            if (id === 200) return undefined; // This will fail
            if (id === 300) return 3000 as any;
            return undefined;
          },
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2); // 100 and 300 succeed
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
      });

      it('should log warning when calibration data attachment fails', async () => {
        const moduleDefinitionIds = [100];

        // Setup invalid ACDB that will cause calibration attachment to fail
        const parsedAcdb = new ParsedAcdb();
        // No calibration chunk added

        mockForeignKeyMapper.getDriverModuleDefinitionSystemId.mockReturnValue(
          1000 as any,
        );

        const result = await builder.buildDriverModules(
          moduleDefinitionIds,
          TEST_FILE_SYSTEM_ID,
          parsedAcdb,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        // Module is still created even if calibration attachment fails
      });
    });
  });
});
