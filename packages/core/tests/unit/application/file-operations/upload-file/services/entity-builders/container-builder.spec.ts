/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ContainerBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/container-builder.js';
import {Container} from '../../../../../../../src/domain/entities/usecase-data/container/container.js';
import type {AcdbContainerProperties} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {
  ENTITY_TYPES,
  ISSUE_SEVERITY,
} from '../../../../../../../src/application/file-operations/upload-file/types/issue-collection.js';
import {ERROR_CODES} from '../../../../../../../src/shared/errors/error-codes.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('ContainerBuilder', () => {
  let builder: ContainerBuilder;
  let mockLogger: jest.Mocked<Logger>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  const TEST_FILE_SYSTEM_ID = 123;

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

    builder = new ContainerBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildContainers', () => {
    describe('Happy Path', () => {
      it('should build containers successfully from valid properties with system IDs assigned', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(0);
        expect(result.warningCount).toBe(0);
        expect(result.issues).toEqual([]);

        // Verify first container
        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.entities[0].containerId).toBe(1);

        // Verify second container
        expect(result.entities[1].systemId).toBeGreaterThan(0);
        expect(result.entities[1].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.entities[1].containerId).toBe(2);

        // Verify ID generation was called
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );

        // Verify foreign key mappings were stored
        expect(mockForeignKeyMapper.addContainerMapping).toHaveBeenCalledTimes(
          2,
        );
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildContainers([], TEST_FILE_SYSTEM_ID);

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
        expect(result.warningCount).toBe(0);
      });

      it('should process multiple container properties', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 5,
            properties: new Map(),
          },
          {
            containerId: 10,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(3);
        expect(result.entities[0].containerId).toBe(1);
        expect(result.entities[1].containerId).toBe(5);
        expect(result.entities[2].containerId).toBe(10);
        expect(result.successCount).toBe(3);
      });

      it('should verify correct BuildResult structure', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveProperty('entities');
        expect(result).toHaveProperty('issues');
        expect(result).toHaveProperty('successCount');
        expect(result).toHaveProperty('errorCount');
        expect(result).toHaveProperty('warningCount');
        expect(Array.isArray(result.entities)).toBe(true);
        expect(Array.isArray(result.issues)).toBe(true);
      });

      it('should log info message on successful conversion', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        await builder.buildContainers(properties, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining(
              'Successfully built 1 containers with system IDs assigned',
            ),
            action: 'container_building_complete',
            component: 'ContainerBuilder',
          }),
        );
      });

      it('should assign fileSystemId to all containers', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.entities[1].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
      });

      it('should handle multiple containers with different IDs', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 5,
            properties: new Map(),
          },
          {
            containerId: 10,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(3);
        expect(result.successCount).toBe(3);
        expect(result.entities[0].containerId).toBe(1);
        expect(result.entities[1].containerId).toBe(5);
        expect(result.entities[2].containerId).toBe(10);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is null', async () => {
        const result = await builder.buildContainers(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildContainers(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should handle container properties with empty properties map', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
      });

      it('should handle container properties with populated properties map', async () => {
        const propertiesMap = new Map<number, Uint8Array>();
        propertiesMap.set(1, new Uint8Array([100]));
        propertiesMap.set(2, new Uint8Array([200]));

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: propertiesMap,
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
      });

      it('should handle large number of container properties', async () => {
        const properties: AcdbContainerProperties[] = [];
        for (let i = 1; i <= 100; i++) {
          properties.push({
            containerId: i,
            properties: new Map(),
          });
        }

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(100);
        expect(result.successCount).toBe(100);
        expect(result.errorCount).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should collect issues when container conversion fails', async () => {
        // Spy on the private convertAcdbContainer method to simulate failure
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation(() => {
            throw new Error('Invalid container data');
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        convertSpy.mockRestore();

        expect(result.entities).toHaveLength(0);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].severity).toBe(ISSUE_SEVERITY.ERROR);
        expect(result.issues[0].entityType).toBe(ENTITY_TYPES.CONTAINER);
      });

      it('should log warning when conversion fails', async () => {
        // Spy on the private convertAcdbContainer method to simulate failure
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation(() => {
            throw new Error('Test error');
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        await builder.buildContainers(properties, TEST_FILE_SYSTEM_ID);

        convertSpy.mockRestore();

        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining(
              'Failed to convert container property',
            ),
            action: 'container_conversion_failed',
            component: 'ContainerBuilder',
          }),
        );
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        const originalConvert = (builder as any).convertAcdbContainer.bind(
          builder,
        );
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation((...args: unknown[]) => {
            callCount++;
            if (callCount === 2) {
              throw new Error('Second container fails');
            }
            return originalConvert(...args);
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
          {
            containerId: 3,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        convertSpy.mockRestore();

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
      });

      it('should include containerId in error issue', async () => {
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation(() => {
            throw new Error('Test error');
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 42,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        convertSpy.mockRestore();

        expect(result.issues[0].entityData).toBe('containerId: 42');
      });

      it('should use correct error code in issues', async () => {
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation(() => {
            throw new Error('Test error');
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        convertSpy.mockRestore();

        expect(result.issues[0].code).toBe(ERROR_CODES.INVALID_ENTITY_DATA);
      });

      it('should handle unknown error types', async () => {
        const convertSpy = jest
          .spyOn(builder as any, 'convertAcdbContainer')
          .mockImplementation(() => {
            throw 'String error'; // Non-Error object
          });

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        convertSpy.mockRestore();

        expect(result.errorCount).toBe(1);
        expect(result.issues[0].message).toBe('Unknown error');
      });
    });

    describe('Logging', () => {
      it('should log conversion complete with success and error counts', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
        ];

        await builder.buildContainers(properties, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Successfully built 2 containers with system IDs assigned, 0 failed',
            action: 'container_building_complete',
            component: 'ContainerBuilder',
            tag: 'container-building',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new ContainerBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
        );

        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        // Should not throw error
        await expect(
          builderWithoutLogger.buildContainers(properties, TEST_FILE_SYSTEM_ID),
        ).resolves.not.toThrow();
      });
    });

    describe('BuildResult Structure', () => {
      it('should return BuildResult with all required fields', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toMatchObject({
          entities: expect.any(Array),
          issues: expect.any(Array),
          successCount: expect.any(Number),
          errorCount: expect.any(Number),
          warningCount: expect.any(Number),
        });
      });

      it('should have warningCount always 0', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.warningCount).toBe(0);
      });

      it('should have entities as Container instances', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0]).toBeInstanceOf(Container);
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each container', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
          {
            containerId: 3,
            properties: new Map(),
          },
        ];

        await builder.buildContainers(properties, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(3);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should store foreign key mappings for all containers', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
        ];

        await builder.buildContainers(properties, TEST_FILE_SYSTEM_ID);

        expect(mockForeignKeyMapper.addContainerMapping).toHaveBeenCalledTimes(
          2,
        );
      });

      it('should assign unique system IDs to each container', async () => {
        const properties: AcdbContainerProperties[] = [
          {
            containerId: 1,
            properties: new Map(),
          },
          {
            containerId: 2,
            properties: new Map(),
          },
        ];

        const result = await builder.buildContainers(
          properties,
          TEST_FILE_SYSTEM_ID,
        );

        const systemIds = result.entities.map(e => e.systemId);
        const uniqueSystemIds = new Set(systemIds);
        expect(uniqueSystemIds.size).toBe(systemIds.length);
      });
    });
  });
});
