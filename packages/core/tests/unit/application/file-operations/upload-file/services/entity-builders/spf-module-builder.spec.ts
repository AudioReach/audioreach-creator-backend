/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import 'reflect-metadata';
import {jest} from '@jest/globals';
import {SpfModuleBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/spf-module-builder.js';
import {SpfModule} from '../../../../../../../src/domain/entities/usecase-data/module/spf-module.js';
import type {
  SpfModuleInfo,
  ModulePropertyConfig,
} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/spf-properties/types.js';
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
import {MODULE_PORT_STRATEGIES} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/index.js';
import {PORT_IO_TYPE} from '../../../../../../../src/domain/entities/common/enums/port-io-type.js';

describe('SpfModuleBuilder', () => {
  let builder: SpfModuleBuilder;
  let mockLogger: jest.Mocked<Logger>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  const TEST_FILE_SYSTEM_ID = 123;
  const TEST_PORT_STRATEGY = MODULE_PORT_STRATEGIES.INPUT_ODD_OUTPUT_EVEN;

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

    // Mock foreign key mapper methods
    mockForeignKeyMapper.getSubgraphSystemId = jest
      .fn()
      .mockReturnValue(100) as any;
    mockForeignKeyMapper.getContainerSystemId = jest
      .fn()
      .mockReturnValue(200) as any;
    mockForeignKeyMapper.getModuleDefinitionSystemId = jest
      .fn()
      .mockReturnValue(300) as any;
    mockForeignKeyMapper.addSpfModuleMapping = jest.fn() as any;
    mockForeignKeyMapper.addDataPortMapping = jest.fn() as any;
    mockForeignKeyMapper.addControlPortMapping = jest.fn() as any;

    builder = new SpfModuleBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildSpfModules', () => {
    describe('Happy Path', () => {
      it('should build SPF modules successfully with system IDs assigned', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(0);
        expect(result.warningCount).toBe(0);
        expect(result.issues).toEqual([]);

        // Verify first module
        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.entities[0].instanceId).toBe(101);
        expect(result.entities[0].definitionSystemId).toBe(300);
        expect(result.entities[0].containerSystemId).toBe(200);
        expect(result.entities[0].subgraphSystemId).toBe(100);

        // Verify second module
        expect(result.entities[1].systemId).toBeGreaterThan(0);
        expect(result.entities[1].instanceId).toBe(102);

        // Verify ID generation was called
        expect(mockIdGenerator.getNextId).toHaveBeenCalled();

        // Verify foreign key mappings were stored
        expect(mockForeignKeyMapper.addSpfModuleMapping).toHaveBeenCalledTimes(
          2,
        );
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildSpfModules(
          [],
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
        expect(result.warningCount).toBe(0);
      });

      it('should process multiple module infos', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
          {
            subgraphId: 2,
            containerId: 3,
            spfModules: [
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
      });

      it('should verify correct BuildResult structure', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
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
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining(
              'Successfully built 1 SPF modules with system IDs assigned',
            ),
            action: 'spf_module_building_complete',
            component: 'SpfModuleBuilder',
          }),
        );
      });

      it('should assign fileSystemId to all modules', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.entities[1].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
      });

      it('should use naming convention Module_{instanceId}', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 123,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities[0].alias).toBe('Module_123');
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is null', async () => {
        const result = await builder.buildSpfModules(
          null as any,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildSpfModules(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should handle module infos with empty spfModules array', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.successCount).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should collect issues when module conversion fails', async () => {
        // Mock foreign key mapper to throw error
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Subgraph mapping not found');
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].severity).toBe(ISSUE_SEVERITY.ERROR);
        expect(result.issues[0].entityType).toBe(ENTITY_TYPES.SPF_MODULE);
      });

      it('should log warning when conversion fails', async () => {
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Test error');
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to convert module instance'),
            action: 'spf_module_conversion_failed',
            component: 'SpfModuleBuilder',
          }),
        );
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              throw new Error('First module fails');
            }
            return 100;
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        expect(result.errorCount).toBe(1);
        expect(result.issues).toHaveLength(1);
      });

      it('should include instanceId in error issue', async () => {
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Test error');
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 42,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.issues[0].entityData).toBe('instanceId: 42');
      });

      it('should use correct error code in issues', async () => {
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw new Error('Test error');
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.issues[0].code).toBe(ERROR_CODES.INVALID_ENTITY_DATA);
      });

      it('should handle unknown error types', async () => {
        mockForeignKeyMapper.getSubgraphSystemId = jest
          .fn()
          .mockImplementation(() => {
            throw 'String error'; // Non-Error object
          }) as any;

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.errorCount).toBe(1);
        expect(result.issues[0].message).toBe('Unknown error');
      });
    });

    describe('Logging', () => {
      it('should log conversion complete with success and error counts', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Successfully built 2 SPF modules with system IDs assigned, 0 failed',
            action: 'spf_module_building_complete',
            component: 'SpfModuleBuilder',
            tag: 'spf-module-building',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new SpfModuleBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
        );

        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        // Should not throw error
        await expect(
          builderWithoutLogger.buildSpfModules(
            spfModuleInfos,
            TEST_FILE_SYSTEM_ID,
            TEST_PORT_STRATEGY,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('BuildResult Structure', () => {
      it('should return BuildResult with all required fields', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
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
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.warningCount).toBe(0);
      });

      it('should have entities as SpfModule instances', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(result.entities[0]).toBeInstanceOf(SpfModule);
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each module', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
              {
                instanceId: 103,
                moduleId: 1003,
              },
            ],
          },
        ];

        await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        // Called for each module (3 times)
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should store foreign key mappings for all modules', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        expect(mockForeignKeyMapper.addSpfModuleMapping).toHaveBeenCalledTimes(
          2,
        );
      });

      it('should assign unique system IDs to each module', async () => {
        const spfModuleInfos: SpfModuleInfo[] = [
          {
            subgraphId: 1,
            containerId: 2,
            spfModules: [
              {
                instanceId: 101,
                moduleId: 1001,
              },
              {
                instanceId: 102,
                moduleId: 1002,
              },
            ],
          },
        ];

        const result = await builder.buildSpfModules(
          spfModuleInfos,
          TEST_FILE_SYSTEM_ID,
          TEST_PORT_STRATEGY,
        );

        const systemIds = result.entities.map(e => e.systemId);
        const uniqueSystemIds = new Set(systemIds);
        expect(uniqueSystemIds.size).toBe(systemIds.length);
      });
    });
  });
});
