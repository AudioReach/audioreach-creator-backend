/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {EntityBuilderService} from '../../../../../../src/application/file-operations/upload-file/services/entity-builder-service.js';
import {ParsedAcdb} from '../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import type {ModuleManagerChunk} from '../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/module-manager-chunk-parser.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {IdGenerationPort} from '../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../src/shared/types/logger.interface.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../helpers/index.js';

/**
 * Helper to create a module registration with proper capi structure
 */
function createModuleRegistration(
  moduleId: number,
  fileName: string,
  tag: string,
  interfaceType: number = 1,
  interfaceVersion: number = 1,
  moduleType: number = 1,
) {
  return {
    interfaceType,
    interfaceVersion,
    capi: {
      moduleType,
      moduleId,
      fileNameLen: fileName.length,
      tagLen: tag.length,
      errorCode: 0,
      fileName,
      tag,
    },
  };
}

describe('EntityBuilderService - buildModuleManagerData', () => {
  let service: EntityBuilderService;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    service = new EntityBuilderService(
      mockIdGenerator,
      mockForeignKeyMapper,
      undefined,
      mockLogger,
    );
  });

  describe('buildModuleManagerData', () => {
    describe('Happy Path', () => {
      it('should build module manager data from chunk', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        // Add a processor with a module registration
        const processorId = 100;
        const moduleId = 200;
        mmgrChunk.registrations.set(
          processorId,
          new Map([
            [
              moduleId,
              createModuleRegistration(moduleId, 'test.so', 'v1.0', 1, 2, 3),
            ],
          ]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        // Setup foreign key mappings
        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getModuleDefinitionSystemId.mockReturnValue(
          2000 as any,
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].processorDefinitionSystemId).toBe(1000);
        expect(result[0].moduleDefinitionSystemId).toBe(2000);
        expect(result[0].moduleType).toBe(3);
        expect(result[0].interfaceType).toBe(1);
        expect(result[0].interfaceVersion).toBe(2);
        expect(result[0].fileName).toBe('test.so');
        expect(result[0].tag).toBe('v1.0');
        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(1);
      });

      it('should handle multiple processors with multiple modules', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        // Processor 1 with 2 modules
        mmgrChunk.registrations.set(
          100,
          new Map([
            [200, createModuleRegistration(200, 'mod1.so', 'v1')],
            [201, createModuleRegistration(201, 'mod2.so', 'v1')],
          ]),
        );

        // Processor 2 with 1 module
        mmgrChunk.registrations.set(
          101,
          new Map([
            [300, createModuleRegistration(300, 'mod3.so', 'v2', 2, 2, 2)],
          ]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        // Setup foreign key mappings
        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockImplementation(
          (naturalId: any) => {
            const id = Number(naturalId);
            if (id === 100) return 1000 as any;
            if (id === 101) return 1001 as any;
            return undefined;
          },
        );
        mockForeignKeyMapper.getModuleDefinitionSystemId.mockImplementation(
          (processorId: any, moduleId: any) => {
            const modId = Number(moduleId);
            if (modId === 200) return 2000 as any;
            if (modId === 201) return 2001 as any;
            if (modId === 300) return 3000 as any;
            return undefined;
          },
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(3);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(3);
      });

      it('should assign unique system IDs to each entry', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        mmgrChunk.registrations.set(
          100,
          new Map([
            [200, createModuleRegistration(200, 'mod1.so', 'v1')],
            [201, createModuleRegistration(201, 'mod2.so', 'v1')],
          ]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        // Configure mock to return incrementing IDs
        let idCounter = 0;
        mockIdGenerator.getNextId.mockImplementation(async () => {
          idCounter++;
          return idCounter;
        });

        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getModuleDefinitionSystemId.mockReturnValue(
          2000 as any,
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].systemId).toBeGreaterThan(0);
        expect(result[1].systemId).toBeGreaterThan(0);
        expect(result[0].systemId).not.toBe(result[1].systemId);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array when no module manager chunk present', async () => {
        const parsedAcdb = new ParsedAcdb();

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
      });

      it('should return empty array when module manager chunk has no registrations', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };
        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
      });

      it('should skip processor when processor mapping not found', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        mmgrChunk.registrations.set(
          100,
          new Map([[200, createModuleRegistration(200, 'test.so', 'v1')]]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        // Return undefined for processor mapping
        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockReturnValue(
          undefined,
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should skip module when module definition mapping not found', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        mmgrChunk.registrations.set(
          100,
          new Map([[200, createModuleRegistration(200, 'test.so', 'v1')]]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        // Return undefined for module definition mapping
        mockForeignKeyMapper.getModuleDefinitionSystemId.mockReturnValue(
          undefined,
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalled();
      });

      it('should continue processing after skipping invalid entries', async () => {
        const parsedAcdb = new ParsedAcdb();
        const mmgrChunk: ModuleManagerChunk = {
          chunkType: 'MODULE_MANAGER',
          registrations: new Map(),
        };

        mmgrChunk.registrations.set(
          100,
          new Map([
            [200, createModuleRegistration(200, 'mod1.so', 'v1')],
            [201, createModuleRegistration(201, 'mod2.so', 'v1')],
          ]),
        );

        parsedAcdb.addChunk(PARSED_CHUNK_TYPES.MODULE_MANAGER, mmgrChunk);

        mockForeignKeyMapper.getProcessorDefinitionSystemId.mockReturnValue(
          1000 as any,
        );
        mockForeignKeyMapper.getModuleDefinitionSystemId.mockImplementation(
          (processorId: any, moduleId: any) => {
            const modId = Number(moduleId);
            if (modId === 200) return undefined; // This will be skipped
            if (modId === 201) return 2001 as any;
            return undefined;
          },
        );

        const result = await service.buildModuleManagerData(
          parsedAcdb,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1); // Only module 201 succeeds
        expect(result[0].moduleDefinitionSystemId).toBe(2001);
        expect(mockLogger.logWarn).toHaveBeenCalled();
      });
    });
  });
});
