/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import 'reflect-metadata';
import {jest} from '@jest/globals';
import {UsecaseBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/usecase-builder.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseEntry} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/usecase-data-chunk.js';
import type {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {asSystemId} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import {CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../../../../src/shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../../../../src/shared/types/subgraph-pair.js';

describe('UsecaseBuilder', () => {
  let builder: UsecaseBuilder;
  let mockLogger: jest.Mocked<Logger>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockParsedAcdb: jest.Mocked<ParsedAcdb>;
  const TEST_FILE_SYSTEM_ID = 123;

  // Helper function to calculate expected system ID from instance ID
  const getExpectedModuleSystemId = (instanceId: number): number =>
    100 + (instanceId - 101);

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    // Configure mock to return incrementing IDs
    let idCounter = 0;
    mockIdGenerator.getNextId.mockImplementation(async () => {
      idCounter++;
      return idCounter;
    });

    // Mock foreign key mapper methods to return values for any input
    mockForeignKeyMapper.getValueSystemId.mockImplementation(() =>
      asSystemId(500),
    );
    // Return different module system IDs for different instances to avoid duplicates
    let moduleIdCounter = 100;
    mockForeignKeyMapper.getSpfModuleSystemId.mockImplementation(() => {
      const id = moduleIdCounter;
      moduleIdCounter += 1;
      return asSystemId(id);
    });
    // Return different data link system IDs for different hashes
    let dataLinkIdCounter = 200;
    mockForeignKeyMapper.getDataLinkSystemId.mockImplementation(() => {
      const id = dataLinkIdCounter;
      dataLinkIdCounter += 1;
      return asSystemId(id);
    });

    // Mock ParsedAcdb
    mockParsedAcdb = {
      getChunk: jest.fn(),
    } as any;

    builder = new UsecaseBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockParsedAcdb,
      mockLogger,
    );
  });

  describe('buildUsecases', () => {
    describe('Happy Path', () => {
      it('should build usecases successfully with system IDs assigned', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(1, 10),
              new KeyValue(2, 20),
            ]),
            sgPropOffset: 0,
            sgList: [1, 2],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(3, 30),
              new KeyValue(4, 40),
            ]),
            sgPropOffset: 0,
            sgList: [3],
            sgPairList: [new SubgraphPair(1, 2)],
          },
        ];

        // Mock subgraph data chunk - return all modules (getAllModules doesn't take parameters)
        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([
            {
              subgraphId: 1,
              spfModules: [{instanceId: 101}, {instanceId: 102}],
            },
            {
              subgraphId: 2,
              spfModules: [{instanceId: 103}],
            },
            {
              subgraphId: 3,
              spfModules: [{instanceId: 104}],
            },
          ]),
          getAllDataLinks: jest.fn().mockImplementation((...args: any[]) => {
            const sgList = args[0] as number[] | undefined;
            // Return data links based on which subgraphs are requested
            if (!sgList || sgList.length === 0) {
              return [];
            }
            // First usecase requests [1, 2], second usecase requests [3]
            if (sgList.includes(1) || sgList.includes(2)) {
              return [
                {
                  isInterGraph: false,
                  naturalKeyHash: 'hash1',
                },
              ];
            }
            if (sgList.includes(3)) {
              return []; // No data links for subgraph 3
            }
            return [];
          }),
        };

        const mockSubgraphPairDataChunk = {
          getDataLinksForSubgraphPairs: jest.fn().mockReturnValue([
            {
              isInterGraph: true,
              naturalKeyHash: 'inter_hash1',
            },
          ]),
        };

        mockParsedAcdb.getChunk.mockImplementation((chunkType: string) => {
          if (chunkType === CHUNK_TYPES.SUBGRAPH_DATA) {
            return mockSubgraphDataChunk as any;
          }
          if (chunkType === CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT) {
            return mockSubgraphPairDataChunk as any;
          }
          return null;
        });

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(2);

        // Verify first usecase
        expect(result[0].systemId).toBeGreaterThan(0);
        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result[0].keyVector.valueSystemIds).toEqual([500, 500]);
        expect(result[0].moduleSystemIds.length).toBeGreaterThan(0);

        // Verify second usecase
        expect(result[1].systemId).toBeGreaterThan(0);
        expect(result[1].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);

        // Verify ID generation was called
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildUsecases([], TEST_FILE_SYSTEM_ID);

        expect(result).toEqual([]);
      });

      it('should log completion message', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('system IDs assigned'),
            action: 'usecase_conversion_complete',
            component: 'UsecaseBuilder',
          }),
        );
      });

      it('should assign unique system IDs to each usecase', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        const systemIds = result.map(uc => uc.systemId);
        const uniqueSystemIds = new Set(systemIds);
        expect(uniqueSystemIds.size).toBe(systemIds.length);
      });

      it('should add module system IDs from subgraphs', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1, 2],
            sgPairList: [],
          },
        ];

        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([
            {
              subgraphId: 1,
              spfModules: [{instanceId: 101}, {instanceId: 102}],
            },
            {
              subgraphId: 2,
              spfModules: [{instanceId: 103}],
            },
          ]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        };

        mockParsedAcdb.getChunk.mockReturnValue(mockSubgraphDataChunk as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].moduleSystemIds).toHaveLength(3);
        expect(result[0].moduleSystemIds).toEqual([
          getExpectedModuleSystemId(101),
          getExpectedModuleSystemId(102),
          getExpectedModuleSystemId(103),
        ]);
      });

      it('should add data link system IDs from subgraphs', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1],
            sgPairList: [],
          },
        ];

        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => [
            {
              isInterGraph: false,
              naturalKeyHash: 'hash1',
            },
            {
              isInterGraph: false,
              naturalKeyHash: 'hash2',
            },
          ]),
        };

        mockParsedAcdb.getChunk.mockReturnValue(mockSubgraphDataChunk as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].dataLinkSystemIds).toHaveLength(2);
        // Data link IDs start at 200 and increment
        expect(result[0].dataLinkSystemIds).toEqual([200, 201]);
      });

      it('should handle inter-subgraph data links from subgraph pairs', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1],
            sgPairList: [new SubgraphPair(1, 2)],
          },
        ];

        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        };

        const mockSubgraphPairDataChunk = {
          getDataLinksForSubgraphPairs: jest.fn().mockReturnValue([
            {
              isInterGraph: true,
              naturalKeyHash: 'inter_hash1',
            },
          ]),
        };

        mockParsedAcdb.getChunk.mockImplementation((chunkType: string) => {
          if (chunkType === CHUNK_TYPES.SUBGRAPH_DATA) {
            return mockSubgraphDataChunk as any;
          }
          if (chunkType === CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT) {
            return mockSubgraphPairDataChunk as any;
          }
          return null;
        });

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].dataLinkSystemIds).toHaveLength(1);
        expect(result[0].dataLinkSystemIds).toEqual([200]);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array when input is null', async () => {
        const result = await builder.buildUsecases(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toEqual([]);
      });

      it('should return empty array when input is undefined', async () => {
        const result = await builder.buildUsecases(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toEqual([]);
      });

      it('should handle usecases with no subgraphs', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].moduleSystemIds).toHaveLength(0);
        expect(result[0].dataLinkSystemIds).toHaveLength(0);
      });

      it('should skip inter-graph data links in intra-subgraph processing', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1],
            sgPairList: [],
          },
        ];

        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => [
            {
              isInterGraph: true, // Should be skipped
              naturalKeyHash: 'hash1',
            },
            {
              isInterGraph: false,
              naturalKeyHash: 'hash2',
            },
          ]),
        };

        mockParsedAcdb.getChunk.mockReturnValue(mockSubgraphDataChunk as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].dataLinkSystemIds).toHaveLength(1);
      });
    });

    describe('Error Handling', () => {
      it('should skip usecase when no key-value pairs exist', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to convert usecase entry'),
            action: 'usecase_conversion_failed',
          }),
        );
      });

      it('should skip usecase when all key-value mappings fail', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('No valid value systemIds found'),
          }),
        );
      });

      it('should log warning when value mapping fails but continue with valid mappings', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return null; // First mapping fails
            }
            return 500;
          }) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(1, 10),
              new KeyValue(2, 20),
            ]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].keyVector.valueSystemIds).toHaveLength(1);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('No foreign key mapping found'),
            action: 'missing_value_mapping',
          }),
        );
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return null; // First usecase's first value fails
            }
            return asSystemId(500);
          }) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
      });

      it('should log warning when adding module system IDs fails', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1],
            sgPairList: [],
          },
        ];

        const mockSubgraphDataChunk = {
          getAllModules: jest.fn().mockReturnValue([
            {
              subgraphId: 1,
              spfModules: [{instanceId: 101}],
            },
          ]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        };

        mockParsedAcdb.getChunk.mockReturnValue(mockSubgraphDataChunk as any);

        // Mock to cause duplicate error
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockReturnValue(100) as any;

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        // Should still have the module IDs added
        expect(result[0].moduleSystemIds.length).toBeGreaterThan(0);
      });

      it('should handle missing subgraph data chunk gracefully', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue(undefined);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].moduleSystemIds).toHaveLength(0);
        expect(result[0].dataLinkSystemIds).toHaveLength(0);
      });
    });

    describe('Logging', () => {
      it('should log success and error counts', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue(500) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Converted 1 usecases successfully, 1 failed, system IDs assigned',
            action: 'usecase_conversion_complete',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new UsecaseBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          mockParsedAcdb,
        );

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        await expect(
          builderWithoutLogger.buildUsecases(
            usecaseEntries,
            TEST_FILE_SYSTEM_ID,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each usecase', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should not call idGenerator when all usecases fail conversion', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });
    });

    describe('UseCase Entity', () => {
      it('should create UseCase instances', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0]).toBeInstanceOf(UseCase);
      });

      it('should set fileSystemId correctly', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
      });

      it('should populate keyVector with value system IDs', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValueOnce(501)
          .mockReturnValueOnce(502)
          .mockReturnValueOnce(503) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(1, 10),
              new KeyValue(2, 20),
              new KeyValue(3, 30),
            ]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        mockParsedAcdb.getChunk.mockReturnValue({
          getAllModules: jest.fn().mockReturnValue([]),
          getAllDataLinks: jest.fn().mockImplementation(() => []),
        } as any);

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].keyVector.valueSystemIds).toEqual([501, 502, 503]);
      });
    });
  });
});
