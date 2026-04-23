/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import 'reflect-metadata';
import {jest} from '@jest/globals';
import {DataLinkBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/data-link-builder.js';
import {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {DataLink as DataLinkProperty} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {asSystemId} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('DataLinkBuilder', () => {
  let builder: DataLinkBuilder;
  let mockLogger: jest.Mocked<Logger>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  const TEST_FILE_SYSTEM_ID = 123;

  // Helper function to calculate expected system ID from instance ID
  const getExpectedSystemId = (instanceId: number): number => instanceId * 10;

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

    // Mock foreign key mapper methods to return different values based on input
    // This prevents SameNodeException by ensuring source and destination have different IDs
    mockForeignKeyMapper.getSpfModuleSystemId.mockImplementation(instanceId => {
      // Return different system IDs based on instance ID to simulate real mapping
      return asSystemId(instanceId.valueOf() * 10);
    });
    mockForeignKeyMapper.getOutputPortSystemId.mockImplementation(() =>
      asSystemId(200),
    );
    mockForeignKeyMapper.getInputPortSystemId.mockImplementation(() =>
      asSystemId(300),
    );

    builder = new DataLinkBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildDataLinks', () => {
    describe('Happy Path', () => {
      it('should build data links successfully with system IDs assigned', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
          {
            sourceInstanceId: 103,
            destinationInstanceId: 104,
            sourcePortId: 3,
            destinationPortId: 4,
            isInterGraph: true,
            naturalKeyHash: 'hash2',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(2);

        // Verify first data link
        expect(result[0].systemId).toBeGreaterThan(0);
        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result[0].sourceNodeSystemId).toBe(getExpectedSystemId(101));
        expect(result[0].destinationNodeSystemId).toBe(
          getExpectedSystemId(102),
        );
        expect(result[0].sourcePortSystemId).toBe(200);
        expect(result[0].destinationPortSystemId).toBe(300);
        expect(result[0].isInterGraph).toBe(false);
        expect(result[0].naturalKeyHash).toBe('hash1');

        // Verify second data link
        expect(result[1].systemId).toBeGreaterThan(0);
        expect(result[1].isInterGraph).toBe(true);
        expect(result[1].naturalKeyHash).toBe('hash2');

        // Verify ID generation was called
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildDataLinks([], TEST_FILE_SYSTEM_ID);

        expect(result).toEqual([]);
        expect(mockLogger.logDebug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'No data link properties provided for building',
            action: 'no_data_link_properties',
          }),
        );
      });

      it('should deduplicate data links by naturalKeyHash', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'duplicate_hash',
          },
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'duplicate_hash',
          },
          {
            sourceInstanceId: 103,
            destinationInstanceId: 104,
            sourcePortId: 3,
            destinationPortId: 4,
            isInterGraph: true,
            naturalKeyHash: 'unique_hash',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(2);
        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('3 total → 2 unique properties'),
            action: 'data_link_deduplication',
          }),
        );
      });

      it('should log completion message', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        await builder.buildDataLinks(dataLinkProperties, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('system IDs assigned'),
            action: 'data_link_building_complete',
            component: 'DataLinkBuilder',
          }),
        );
      });

      it('should assign unique system IDs to each data link', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
          {
            sourceInstanceId: 103,
            destinationInstanceId: 104,
            sourcePortId: 3,
            destinationPortId: 4,
            isInterGraph: true,
            naturalKeyHash: 'hash2',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        const systemIds = result.map(link => link.systemId);
        const uniqueSystemIds = new Set(systemIds);
        expect(uniqueSystemIds.size).toBe(systemIds.length);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array when input is null', async () => {
        const result = await builder.buildDataLinks(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toEqual([]);
      });

      it('should return empty array when input is undefined', async () => {
        const result = await builder.buildDataLinks(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toEqual([]);
      });

      it('should handle all duplicates', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'same_hash',
          },
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'same_hash',
          },
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'same_hash',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
      });
    });

    describe('Error Handling', () => {
      it('should skip data link when source module mapping fails', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockReturnValueOnce(null) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to map source module'),
            action: 'source_module_mapping_failed',
          }),
        );
      });

      it('should skip data link when destination module mapping fails', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(null) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to map destination module'),
            action: 'destination_module_mapping_failed',
          }),
        );
      });

      it('should skip data link when source port mapping fails', async () => {
        mockForeignKeyMapper.getOutputPortSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to map source port'),
            action: 'source_port_mapping_failed',
          }),
        );
      });

      it('should skip data link when destination port mapping fails', async () => {
        mockForeignKeyMapper.getInputPortSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to map destination port'),
            action: 'destination_port_mapping_failed',
          }),
        );
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockImplementation((...args: any[]) => {
            callCount++;
            if (callCount === 1) {
              return null; // First link's source module fails
            }
            // Return valid system IDs for other calls
            const instanceId = args[0] as any;
            return asSystemId(instanceId.valueOf() * 10);
          }) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
          {
            sourceInstanceId: 103,
            destinationInstanceId: 104,
            sourcePortId: 3,
            destinationPortId: 4,
            isInterGraph: true,
            naturalKeyHash: 'hash2',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].naturalKeyHash).toBe('hash2');
      });

      it('should handle unexpected errors during conversion', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Unexpected error');
          }) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Unexpected error converting'),
            action: 'data_link_conversion_error',
          }),
        );
      });
    });

    describe('Logging', () => {
      it('should log deduplication results', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        await builder.buildDataLinks(dataLinkProperties, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Data link deduplication: 2 total → 1 unique properties (1 duplicates removed)',
            action: 'data_link_deduplication',
            component: 'DataLinkBuilder',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new DataLinkBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
        );

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        await expect(
          builderWithoutLogger.buildDataLinks(
            dataLinkProperties,
            TEST_FILE_SYSTEM_ID,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each unique data link', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
          {
            sourceInstanceId: 103,
            destinationInstanceId: 104,
            sourcePortId: 3,
            destinationPortId: 4,
            isInterGraph: true,
            naturalKeyHash: 'hash2',
          },
        ];

        await builder.buildDataLinks(dataLinkProperties, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should not call idGenerator when all links fail conversion', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        await builder.buildDataLinks(dataLinkProperties, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });
    });

    describe('DataLink Entity', () => {
      it('should create DataLink instances', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0]).toBeInstanceOf(DataLink);
      });

      it('should preserve isInterGraph flag', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: true,
            naturalKeyHash: 'hash1',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].isInterGraph).toBe(true);
      });

      it('should preserve naturalKeyHash', async () => {
        const dataLinkProperties: DataLinkProperty[] = [
          {
            sourceInstanceId: 101,
            destinationInstanceId: 102,
            sourcePortId: 1,
            destinationPortId: 2,
            isInterGraph: false,
            naturalKeyHash: 'unique_hash_value',
          },
        ];

        const result = await builder.buildDataLinks(
          dataLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].naturalKeyHash).toBe('unique_hash_value');
      });
    });
  });
});
