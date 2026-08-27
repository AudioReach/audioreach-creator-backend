/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {KeyDefinitionBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/key-definition-builder.js';
import {KeyDefinition} from '../../../../../../../src/domain/entities/definitions/key-value/key-definition.js';
import {ValueDefinition} from '../../../../../../../src/domain/entities/definitions/key-value/entities/value-definition.js';
import type {AwspKeyDefinition} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/index.js';
import type {WorkerPoolPort} from '../../../../../../../src/application/ports/worker/worker-pool.port.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockWorkerPool,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('KeyDefinitionBuilder', () => {
  let builder: KeyDefinitionBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockWorkerPool: jest.Mocked<WorkerPoolPort>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();
    mockWorkerPool = createMockWorkerPool();

    builder = new KeyDefinitionBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockWorkerPool,
      mockLogger,
    );
  });

  describe('buildKeyDefinitions', () => {
    describe('Happy Path', () => {
      it('should build key definitions sequentially when worker pool is not available', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Test Key',
          description: 'Test Description',
          enumName: 'TEST_KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [awspKey],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].keyId).toBe(100);
        expect(result.entities[0].name).toBe('Test Key');
        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(mockIdGenerator.getNextId).toHaveBeenCalled();
        expect(mockForeignKeyMapper.addKeyDefinitionMapping).toHaveBeenCalled();
      });

      it('should build key definitions in parallel when worker pool is available', async () => {
        mockWorkerPool.isThreadingSupported.mockReturnValue(true);

        const awspKey1: AwspKeyDefinition = {
          id: 100,
          name: 'Key 1',
          description: '',
          enumName: 'KEY_1',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const awspKey2: AwspKeyDefinition = {
          id: 200,
          name: 'Key 2',
          description: '',
          enumName: 'KEY_2',
          enumMember: '200',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const mockKey1 = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Key 1',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            enumName: 'KEY_1',
            enumMember: '100',
          },
        });

        const mockKey2 = new KeyDefinition({
          systemId: 0,
          keyId: 200,
          fileSystemId: 0,
          name: 'Key 2',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            enumName: 'KEY_2',
            enumMember: '200',
          },
        });

        mockWorkerPool.executeParallel.mockResolvedValue([
          {
            success: true,
            data: {
              validKeyDefinitions: [mockKey1],
              errors: [],
            },
          },
          {
            success: true,
            data: {
              validKeyDefinitions: [mockKey2],
              errors: [],
            },
          },
        ]);

        const result = await builder.buildKeyDefinitions(
          [awspKey1, awspKey2],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(mockWorkerPool.executeParallel).toHaveBeenCalledTimes(1);
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildKeyDefinitions(
          [],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
      });

      it('should process multiple key definitions', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKeys: AwspKeyDefinition[] = [
          {
            id: 100,
            name: 'Key 1',
            description: '',
            enumName: 'KEY_1',
            enumMember: '100',
            isCalKey: false,
            isGraphKey: true,
            isVoice: false,
            isDynamic: false,
            specialty: 'None',
            values: [],
          },
          {
            id: 200,
            name: 'Key 2',
            description: '',
            enumName: 'KEY_2',
            enumMember: '200',
            isCalKey: false,
            isGraphKey: true,
            isVoice: false,
            isDynamic: false,
            specialty: 'None',
            values: [],
          },
        ];

        const result = await builderWithoutWorker.buildKeyDefinitions(
          awspKeys,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.entities[0].keyId).toBe(100);
        expect(result.entities[1].keyId).toBe(200);
      });

      it('should verify correct BuildResult structure', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Test Key',
          description: '',
          enumName: 'TEST_KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [awspKey],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveProperty('entities');
        expect(result).toHaveProperty('issues');
        expect(Array.isArray(result.entities)).toBe(true);
        expect(Array.isArray(result.issues)).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is null', async () => {
        const result = await builder.buildKeyDefinitions(null as any, 0);

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildKeyDefinitions(undefined as any, 0);

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
      });

      it('should handle keys with no values', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key No Values',
          description: '',
          enumName: 'KEY_NO_VALUES',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [awspKey],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].values).toHaveLength(0);
      });

      it('should handle keys with multiple values', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key With Values',
          description: '',
          enumName: 'KEY_WITH_VALUES',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [
            {
              id: 1,
              name: 'Value 1',
              description: 'Value 1 desc',
              enumMember: '1',
            },
            {
              id: 2,
              name: 'Value 2',
              description: 'Value 2 desc',
              enumMember: '2',
            },
          ],
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [awspKey],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].values).toHaveLength(2);
        expect(result.entities[0].values[0].valueId).toBe(1);
        expect(result.entities[0].values[1].valueId).toBe(2);
      });

      it('should handle keys with all optional fields populated', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Complete Key',
          description: 'Complete Description',
          enumName: 'COMPLETE_KEY',
          enumMember: '100',
          calKeyEnumMember: 'CAL_100',
          graphKeyEnumMember: 'GRAPH_100',
          isCalKey: true,
          isGraphKey: true,
          isVoice: true,
          isDynamic: true,
          specialty: 'Volume',
          values: [
            {
              id: 1,
              name: 'Value 1',
              description: 'Value desc',
              enumMember: '1',
            },
          ],
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [awspKey],
          TEST_FILE_SYSTEM_ID,
        );

        const key = result.entities[0];
        expect(key.description).toBe('Complete Description');
        expect(key.isCalibrationKey).toBe(true);
        expect(key.isGraphKey).toBe(true);
        expect(key.isVoice).toBe(true);
        expect(key.isDynamic).toBe(true);
        expect(key.specialityKeyValue).toBeDefined();
        expect(key.specialityKeyValue?.key).toBe('VOLUME');
        expect(key.values).toHaveLength(1);
      });
    });

    describe('Error Handling', () => {
      it('should collect errors when transformation fails', async () => {
        const builderWithoutWorker = new KeyDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        // Create invalid AWSP key with a null value entry that will cause transformation error
        const invalidAwspKey: any = {
          id: 100,
          name: 'Invalid Key',
          values: [null], // null entry causes TypeError inside value transform loop
        };

        const result = await builderWithoutWorker.buildKeyDefinitions(
          [invalidAwspKey],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should handle worker pool failures in parallel mode', async () => {
        mockWorkerPool.isThreadingSupported.mockReturnValue(true);
        mockWorkerPool.executeParallel.mockResolvedValue([
          {
            success: false,
            error: 'Worker failed',
          },
          {
            success: false,
            error: 'Worker failed',
          },
        ]);

        const awspKey1: AwspKeyDefinition = {
          id: 100,
          name: 'Test Key 1',
          description: '',
          enumName: 'TEST_KEY_1',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const awspKey2: AwspKeyDefinition = {
          id: 200,
          name: 'Test Key 2',
          description: '',
          enumName: 'TEST_KEY_2',
          enumMember: '200',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        // Pass 2 keys to trigger parallel mode (requires length > 1)
        const result = await builder.buildKeyDefinitions(
          [awspKey1, awspKey2],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(mockLogger.logError).toHaveBeenCalled();
      });

      it('should propagate errors from parallel processing', async () => {
        mockWorkerPool.isThreadingSupported.mockReturnValue(true);
        mockWorkerPool.executeParallel.mockRejectedValue(
          new Error('Parallel execution failed'),
        );

        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Test Key',
          description: '',
          enumName: 'TEST_KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        await expect(
          builder.buildKeyDefinitions([awspKey, awspKey], TEST_FILE_SYSTEM_ID),
        ).rejects.toThrow('Parallel execution failed');
      });
    });
  });

  describe('transformKeyDefinition (static method)', () => {
    describe('Happy Path', () => {
      it('should transform basic key definition', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Test Key',
          description: 'Test Description',
          enumName: 'TEST_KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.systemId).toBe(0);
        expect(result.keyId).toBe(100);
        expect(result.fileSystemId).toBe(0);
        expect(result.name).toBe('Test Key');
        expect(result.description).toBe('Test Description');
        expect(result.isCalibrationKey).toBe(false);
        expect(result.isGraphKey).toBe(true);
        expect(result.isVoice).toBe(false);
        expect(result.isDynamic).toBe(false);
      });

      it('should transform values correctly', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [
            {
              id: 1,
              name: 'Value 1',
              description: 'Value 1 desc',
              enumMember: '1',
            },
          ],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.values).toHaveLength(1);
        expect(result.values[0].systemId).toBe(0);
        expect(result.values[0].valueId).toBe(1);
        expect(result.values[0].name).toBe('Value 1');
        expect(result.values[0].description).toBe('Value 1 desc');
        expect(result.values[0].enumMember).toBe('1');
      });

      it('should transform C header attributes', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'TEST_KEY',
          enumMember: '100',
          calKeyEnumMember: 'CAL_100',
          graphKeyEnumMember: 'GRAPH_100',
          isCalKey: true,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.cHeaderAttributes?.enumMember).toBe('TEST_KEY');
        expect(result.cHeaderAttributes?.enumName).toBe('100');
        expect(result.cHeaderAttributes?.calKeyEnumMember).toBe('CAL_100');
        expect(result.cHeaderAttributes?.graphKeyEnumMember).toBe('GRAPH_100');
      });

      it('should transform specialty key', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'Volume',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.specialityKeyValue).toBeDefined();
        expect(result.specialityKeyValue?.key).toBe('VOLUME');
        expect(result.specialityKeyValue?.value).toBe('');
      });
    });

    describe('Edge Cases', () => {
      it('should handle keys with no values', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.values).toHaveLength(0);
      });

      it('should verify systemId placeholder is 0', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [
            {
              id: 1,
              name: 'Value',
              description: '',
              enumMember: '1',
            },
          ],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.systemId).toBe(0);
        expect(result.values[0].systemId).toBe(0);
      });

      it('should verify fileSystemId placeholder is 0', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.fileSystemId).toBe(0);
      });

      it('should handle missing optional fields', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.cHeaderAttributes?.calKeyEnumMember).toBeUndefined();
        expect(result.cHeaderAttributes?.graphKeyEnumMember).toBeUndefined();
      });
    });
  });

  describe('Helper Methods', () => {
    describe('mapSpecialKey', () => {
      it('should map SampleRate to SAMPLE_RATE', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'SampleRate',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.specialityKeyValue?.key).toBe('SAMPLE_RATE');
      });

      it('should map Volume to VOLUME', () => {
        const awspKey: AwspKeyDefinition = {
          id: 100,
          name: 'Key',
          description: '',
          enumName: 'KEY',
          enumMember: '100',
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'Volume',
          values: [],
        };

        const result = KeyDefinitionBuilder.transformKeyDefinition(awspKey);

        expect(result.specialityKeyValue?.key).toBe('VOLUME');
      });
    });
  });

  describe('Parallel vs Sequential Processing', () => {
    it('should use sequential processing when worker pool is undefined', async () => {
      const builderWithoutWorker = new KeyDefinitionBuilder(
        mockIdGenerator,
        mockForeignKeyMapper,
        undefined,
        mockLogger,
      );

      const awspKey: AwspKeyDefinition = {
        id: 100,
        name: 'Key',
        description: '',
        enumName: 'KEY',
        enumMember: '100',
        isCalKey: false,
        isGraphKey: true,
        isVoice: false,
        isDynamic: false,
        specialty: 'None',
        values: [],
      };

      await builderWithoutWorker.buildKeyDefinitions(
        [awspKey],
        TEST_FILE_SYSTEM_ID,
      );

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'sequential_key_building_start',
        }),
      );
    });

    it('should use sequential processing when threading is not supported', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(false);

      const awspKey: AwspKeyDefinition = {
        id: 100,
        name: 'Key',
        description: '',
        enumName: 'KEY',
        enumMember: '100',
        isCalKey: false,
        isGraphKey: true,
        isVoice: false,
        isDynamic: false,
        specialty: 'None',
        values: [],
      };

      await builder.buildKeyDefinitions([awspKey], TEST_FILE_SYSTEM_ID);

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'sequential_key_building_start',
        }),
      );
    });

    it('should use sequential processing when only one key definition', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);

      const awspKey: AwspKeyDefinition = {
        id: 100,
        name: 'Key',
        description: '',
        enumName: 'KEY',
        enumMember: '100',
        isCalKey: false,
        isGraphKey: true,
        isVoice: false,
        isDynamic: false,
        specialty: 'None',
        values: [],
      };

      await builder.buildKeyDefinitions([awspKey], TEST_FILE_SYSTEM_ID);

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'sequential_key_building_start',
        }),
      );
    });

    it('should use parallel processing when conditions are met', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);
      mockWorkerPool.executeParallel.mockResolvedValue([
        {success: true, data: {validKeyDefinitions: [], errors: []}},
        {success: true, data: {validKeyDefinitions: [], errors: []}},
      ]);

      const awspKey1: AwspKeyDefinition = {
        id: 100,
        name: 'Key 1',
        description: '',
        enumName: 'KEY_1',
        enumMember: '100',
        isCalKey: false,
        isGraphKey: true,
        isVoice: false,
        isDynamic: false,
        specialty: 'None',
        values: [],
      };

      const awspKey2: AwspKeyDefinition = {
        id: 200,
        name: 'Key 2',
        description: '',
        enumName: 'KEY_2',
        enumMember: '200',
        isCalKey: false,
        isGraphKey: true,
        isVoice: false,
        isDynamic: false,
        specialty: 'None',
        values: [],
      };

      await builder.buildKeyDefinitions(
        [awspKey1, awspKey2],
        TEST_FILE_SYSTEM_ID,
      );

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'parallel_key_building_start',
        }),
      );
      expect(mockWorkerPool.executeParallel).toHaveBeenCalled();
    });

    it('should split tasks correctly for parallel processing', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);
      mockWorkerPool.executeParallel.mockResolvedValue([
        {success: true, data: {validKeyDefinitions: [], errors: []}},
        {success: true, data: {validKeyDefinitions: [], errors: []}},
      ]);

      const keys: AwspKeyDefinition[] = [];
      for (let i = 0; i < 10; i++) {
        keys.push({
          id: i,
          name: `Key ${i}`,
          description: '',
          enumName: `KEY_${i}`,
          enumMember: String(i),
          isCalKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          specialty: 'None',
          values: [],
        });
      }

      await builder.buildKeyDefinitions(keys, TEST_FILE_SYSTEM_ID);

      expect(mockWorkerPool.executeParallel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({
              awspKeyDefinitions: expect.arrayContaining([
                expect.objectContaining({id: 0}),
              ]),
            }),
          }),
          expect.objectContaining({
            input: expect.objectContaining({
              awspKeyDefinitions: expect.arrayContaining([
                expect.objectContaining({id: 5}),
              ]),
            }),
          }),
        ]),
      );
    });
  });
});
