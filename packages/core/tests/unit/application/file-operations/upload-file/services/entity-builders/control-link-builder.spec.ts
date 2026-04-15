/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import 'reflect-metadata';
import {jest} from '@jest/globals';
import {ControlLinkBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/control-link-builder.js';
import {ControlLink} from '../../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {ControlLink as ControlLinkProperty} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {asSystemId} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('ControlLinkBuilder', () => {
  let builder: ControlLinkBuilder;
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
    // This prevents SameNodeException by ensuring peer nodes have different IDs
    mockForeignKeyMapper.getSpfModuleSystemId.mockImplementation(instanceId => {
      // Return different system IDs based on instance ID to simulate real mapping
      return asSystemId(instanceId.valueOf() * 10);
    });
    mockForeignKeyMapper.getControlPortSystemId.mockImplementation(() =>
      asSystemId(200),
    );

    builder = new ControlLinkBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildControlLinks', () => {
    describe('Happy Path', () => {
      it('should build control links successfully with system IDs assigned', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001, 1002],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 103,
            peer2InstanceId: 104,
            peer1PortId: 3,
            peer2PortId: 4,
            intents: [1003],
            heapId: 6,
            isInterGraph: true,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(2);
        expect(result.controlPortIntents.size).toBeGreaterThan(0);

        // Verify first control link
        expect(result.controlLinks[0].systemId).toBeGreaterThan(0);
        expect(result.controlLinks[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.controlLinks[0].peerNodeASystemId).toBe(
          getExpectedSystemId(101),
        );
        expect(result.controlLinks[0].peerNodeBSystemId).toBe(
          getExpectedSystemId(102),
        );
        expect(result.controlLinks[0].nodeAPortSystemId).toBe(200);
        expect(result.controlLinks[0].nodeBPortSystemId).toBe(200);
        expect(result.controlLinks[0].heapId).toBe(5);
        expect(result.controlLinks[0].isInterGraph).toBe(false);

        // Verify second control link
        expect(result.controlLinks[1].systemId).toBeGreaterThan(0);
        expect(result.controlLinks[1].heapId).toBe(6);
        expect(result.controlLinks[1].isInterGraph).toBe(true);

        // Verify ID generation was called
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildControlLinks([], TEST_FILE_SYSTEM_ID);

        expect(result.controlLinks).toEqual([]);
        expect(result.controlPortIntents.size).toBe(0);
        expect(mockLogger.logDebug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'No control link properties provided for building',
            action: 'no_control_link_properties',
          }),
        );
      });

      it('should deduplicate control links by composite key', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 103,
            peer2InstanceId: 104,
            peer1PortId: 3,
            peer2PortId: 4,
            intents: [1002],
            heapId: 6,
            isInterGraph: true,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(2);
        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('3 total → 2 unique properties'),
            action: 'control_link_deduplication',
          }),
        );
      });

      it('should treat bidirectional links as identical', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 102,
            peer2InstanceId: 101,
            peer1PortId: 2,
            peer2PortId: 1,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(1);
      });

      it('should collect intents for control ports', async () => {
        // Mock to return different port IDs for different module/port combinations
        mockForeignKeyMapper.getControlPortSystemId.mockImplementation(
          (moduleSystemId, portId) => {
            return asSystemId(moduleSystemId.valueOf() + portId.valueOf());
          },
        );

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001, 1002],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlPortIntents.size).toBe(2);
        // Check that both ports have intents
        const port1SystemId = getExpectedSystemId(101) + 1; // 1010 + 1 = 1011
        const port2SystemId = getExpectedSystemId(102) + 2; // 1020 + 2 = 1022
        const port1Intents = result.controlPortIntents.get(port1SystemId);
        const port2Intents = result.controlPortIntents.get(port2SystemId);
        expect(port1Intents).toContain(1001);
        expect(port1Intents).toContain(1002);
        expect(port2Intents).toContain(1001);
        expect(port2Intents).toContain(1002);
      });

      it('should log completion message', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('system IDs assigned'),
            action: 'control_link_building_complete',
            component: 'ControlLinkBuilder',
          }),
        );
      });

      it('should assign unique system IDs to each control link', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 103,
            peer2InstanceId: 104,
            peer1PortId: 3,
            peer2PortId: 4,
            intents: [1002],
            heapId: 6,
            isInterGraph: true,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        const systemIds = result.controlLinks.map(link => link.systemId);
        const uniqueSystemIds = new Set(systemIds);
        expect(uniqueSystemIds.size).toBe(systemIds.length);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is null', async () => {
        const result = await builder.buildControlLinks(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toEqual([]);
        expect(result.controlPortIntents.size).toBe(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildControlLinks(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toEqual([]);
        expect(result.controlPortIntents.size).toBe(0);
      });

      it('should handle all duplicates', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(1);
      });

      it('should handle control links with no intents', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(1);
        expect(result.controlPortIntents.size).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should skip control link when peer1 module mapping fails', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Module mapping not found');
          }) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to convert control link'),
            action: 'control_link_conversion_failed',
          }),
        );
      });

      it('should skip control link when control port mapping fails', async () => {
        mockForeignKeyMapper.getControlPortSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Port mapping not found');
          }) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(0);
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockImplementation((...args: any[]) => {
            callCount++;
            if (callCount === 1) {
              throw new Error('First link fails');
            }
            // Return valid system IDs for other calls
            const instanceId = args[0] as any;
            return asSystemId(instanceId.valueOf() * 10);
          }) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 103,
            peer2InstanceId: 104,
            peer1PortId: 3,
            peer2PortId: 4,
            intents: [1002],
            heapId: 6,
            isInterGraph: true,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks).toHaveLength(1);
        expect(result.controlLinks[0].heapId).toBe(6);
      });
    });

    describe('Logging', () => {
      it('should log deduplication results', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Control link deduplication: 2 total → 1 unique properties (1 duplicates removed)',
            action: 'control_link_deduplication',
            component: 'ControlLinkBuilder',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new ControlLinkBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
        );

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        await expect(
          builderWithoutLogger.buildControlLinks(
            controlLinkProperties,
            TEST_FILE_SYSTEM_ID,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each unique control link', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 103,
            peer2InstanceId: 104,
            peer1PortId: 3,
            peer2PortId: 4,
            intents: [1002],
            heapId: 6,
            isInterGraph: true,
          },
        ];

        await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should not call idGenerator when all links fail conversion', async () => {
        mockForeignKeyMapper.getSpfModuleSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Mapping failed');
          }) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });
    });

    describe('ControlLink Entity', () => {
      it('should create ControlLink instances', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks[0]).toBeInstanceOf(ControlLink);
      });

      it('should preserve isInterGraph flag', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 5,
            isInterGraph: true,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks[0].isInterGraph).toBe(true);
      });

      it('should preserve heapId', async () => {
        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001],
            heapId: 42,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.controlLinks[0].heapId).toBe(42);
      });
    });

    describe('Intent Collection', () => {
      it('should merge intents from multiple links for same port', async () => {
        let portIdCounter = 200;
        mockForeignKeyMapper.getControlPortSystemId = jest
          .fn()
          .mockImplementation(() => {
            return portIdCounter; // Return same port ID for both calls
          }) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001, 1002],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 103,
            peer1PortId: 1,
            peer2PortId: 3,
            intents: [1003, 1004],
            heapId: 6,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        const portIntents = result.controlPortIntents.get(200);
        expect(portIntents).toBeDefined();
        expect(portIntents?.length).toBeGreaterThan(0);
      });

      it('should deduplicate intents for same port', async () => {
        mockForeignKeyMapper.getControlPortSystemId = jest
          .fn()
          .mockReturnValue(200) as any;

        const controlLinkProperties: ControlLinkProperty[] = [
          {
            peer1InstanceId: 101,
            peer2InstanceId: 102,
            peer1PortId: 1,
            peer2PortId: 2,
            intents: [1001, 1002],
            heapId: 5,
            isInterGraph: false,
          },
          {
            peer1InstanceId: 101,
            peer2InstanceId: 103,
            peer1PortId: 1,
            peer2PortId: 3,
            intents: [1001, 1003],
            heapId: 6,
            isInterGraph: false,
          },
        ];

        const result = await builder.buildControlLinks(
          controlLinkProperties,
          TEST_FILE_SYSTEM_ID,
        );

        const portIntents = result.controlPortIntents.get(200);
        expect(portIntents).toBeDefined();
        // Should have unique intents only
        const uniqueIntents = new Set(portIntents);
        expect(uniqueIntents.size).toBe(portIntents?.length);
      });
    });
  });
});
