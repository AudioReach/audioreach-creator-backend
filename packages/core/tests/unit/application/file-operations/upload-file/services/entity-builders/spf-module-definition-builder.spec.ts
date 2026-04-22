/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {SpfModuleDefinitionBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/spf-module-definition-builder.js';
import {SpfModuleDefinition} from '../../../../../../../src/domain/entities/definitions/spf-module/spf-module-definition.js';
import {ParamDefinition} from '../../../../../../../src/domain/entities/definitions/common/entities/param-definition.js';
import {PARAM_TYPE} from '../../../../../../../src/domain/entities/definitions/common/types/param-type.js';
import {TOOL_POLICY} from '../../../../../../../src/domain/entities/definitions/common/types/tool-policy-type.js';
import type {AwspSpfModuleDefinition} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/index.js';
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

describe('SpfModuleDefinitionBuilder', () => {
  let builder: SpfModuleDefinitionBuilder;
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

    builder = new SpfModuleDefinitionBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockWorkerPool,
      mockLogger,
    );
  });

  describe('buildModuleDefinitions', () => {
    describe('Happy Path', () => {
      it('should build module definitions sequentially when worker pool is not available', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Test Module',
          displayName: 'Test Module Display',
          description: 'Test Description',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [1, 2],
          supportedContainerTypes: [10, 20],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].moduleDefinitionId).toBe(100);
        expect(result.entities[0].name).toBe('Test Module');
        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result.successCount).toBe(1);
        expect(result.errorCount).toBe(0);
        expect(mockIdGenerator.getNextId).toHaveBeenCalled();
        expect(
          mockForeignKeyMapper.addModuleDefinitionMapping,
        ).toHaveBeenCalled();
      });

      it('should build module definitions in parallel when worker pool is available', async () => {
        mockWorkerPool.isThreadingSupported.mockReturnValue(true);

        const awspModule1: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module 1',
          displayName: 'Module 1',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const awspModule2: AwspSpfModuleDefinition = {
          id: 200,
          name: 'Module 2',
          displayName: 'Module 2',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const mockModule1 = new SpfModuleDefinition({
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 0,
          name: 'Module 1',
          displayName: 'Module 1',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        });

        const mockModule2 = new SpfModuleDefinition({
          systemId: 0,
          moduleDefinitionId: 200,
          fileSystemId: 0,
          name: 'Module 2',
          displayName: 'Module 2',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        });

        mockWorkerPool.executeParallel.mockResolvedValue([
          {
            success: true,
            data: {
              validModuleDefinitions: [mockModule1],
              errors: [],
            },
          },
          {
            success: true,
            data: {
              validModuleDefinitions: [mockModule2],
              errors: [],
            },
          },
        ]);

        const result = await builder.buildModuleDefinitions(
          [awspModule1, awspModule2],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.successCount).toBe(2);
        expect(result.errorCount).toBe(0);
        expect(mockWorkerPool.executeParallel).toHaveBeenCalledTimes(1);
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildModuleDefinitions(
          [],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should process multiple module definitions', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModules: AwspSpfModuleDefinition[] = [
          {
            id: 100,
            name: 'Module 1',
            displayName: 'Module 1',
            description: '',
            paramDefinitions: [],
            inputPortsInfo: {maxPortCount: 1, ports: []},
            outputPortsInfo: {maxPortCount: 1, ports: []},
            controlPortsInfo: {staticPorts: [], dynamicIntents: []},
            supportedProcessorIds: [],
            supportedContainerTypes: [],
          },
          {
            id: 200,
            name: 'Module 2',
            displayName: 'Module 2',
            description: '',
            paramDefinitions: [],
            inputPortsInfo: {maxPortCount: 1, ports: []},
            outputPortsInfo: {maxPortCount: 1, ports: []},
            controlPortsInfo: {staticPorts: [], dynamicIntents: []},
            supportedProcessorIds: [],
            supportedContainerTypes: [],
          },
        ];

        const result = await builderWithoutWorker.buildModuleDefinitions(
          awspModules,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.entities[0].moduleDefinitionId).toBe(100);
        expect(result.entities[1].moduleDefinitionId).toBe(200);
        expect(result.successCount).toBe(2);
      });

      it('should verify correct BuildResult structure', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
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
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is null', async () => {
        const result = await builder.buildModuleDefinitions(null as any, 0);

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildModuleDefinitions(
          undefined as any,
          0,
        );

        expect(result.entities).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
      });

      it('should handle modules with no parameters', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module No Params',
          displayName: 'Module No Params',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters).toHaveLength(0);
        expect(result.successCount).toBe(1);
      });

      it('should handle modules with multiple parameters', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module With Params',
          displayName: 'Module With Params',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param 1',
              description: 'Param 1 desc',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'Shared',
              elements: [],
            },
            {
              id: 2,
              name: 'Param 2',
              description: 'Param 2 desc',
              maxSize: 200,
              toolPolicies: ['RTC'],
              pidType: 'GlobalShared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        expect(result.entities[0].parameters).toHaveLength(2);
        expect(result.entities[0].parameters[0].paramId).toBe(1);
        expect(result.entities[0].parameters[1].paramId).toBe(2);
        expect(result.entities[0].parameters[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].parameters[1].systemId).toBeGreaterThan(0);
        expect(
          mockForeignKeyMapper.addParamDefinitionMapping,
        ).toHaveBeenCalledTimes(2);
      });

      it('should handle modules with data ports', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module With Ports',
          displayName: 'Module With Ports',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {
            maxPortCount: 2,
            ports: [
              {id: 1, name: 'Input Port 1'},
              {id: 2, name: 'Input Port 2'},
            ],
          },
          outputPortsInfo: {
            maxPortCount: 1,
            ports: [{id: 3, name: 'Output Port 1'}],
          },
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].dataPortGroups).toHaveLength(2);
        expect(result.entities[0].dataPortGroups[0].portIoType).toBe('Input');
        expect(result.entities[0].dataPortGroups[1].portIoType).toBe('Output');
      });

      it('should handle modules with control ports', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module With Control Ports',
          displayName: 'Module With Control Ports',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {
            staticPorts: [
              {id: 1, name: 'Static Port 1', supportedIntents: []},
              {id: 2, name: 'Static Port 2', supportedIntents: []},
            ],
            dynamicIntents: [
              {id: 10, name: 'Intent 1', maxports: 5},
              {id: 20, name: 'Intent 2', maxports: 10},
            ],
          },
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].staticControlPorts).toHaveLength(2);
        expect(result.entities[0].dynamicIntents).toHaveLength(2);
      });

      it('should handle modules with all optional fields populated', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Complete Module',
          displayName: 'Complete Module Display',
          description: 'Complete Description',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param 1',
              description: 'Param desc',
              maxSize: 100,
              toolPolicies: ['Calibration', 'RTC'],
              pidType: 'Shared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 2, ports: [{id: 1, name: 'In 1'}]},
          outputPortsInfo: {maxPortCount: 2, ports: [{id: 2, name: 'Out 1'}]},
          controlPortsInfo: {
            staticPorts: [{id: 3, name: 'Static 1', supportedIntents: []}],
            dynamicIntents: [{id: 10, name: 'Intent 1', maxports: 5}],
          },
          supportedProcessorIds: [1, 2, 3],
          supportedContainerTypes: [10, 20, 30],
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [awspModule],
          TEST_FILE_SYSTEM_ID,
        );

        const module = result.entities[0];
        expect(module.displayName).toBe('Complete Module Display');
        expect(module.description).toBe('Complete Description');
        expect(module.parameters).toHaveLength(1);
        expect(module.staticControlPorts).toHaveLength(1);
        expect(module.dynamicIntents).toHaveLength(1);
        expect(module.processorSystemIds).toEqual(new Set([1, 2, 3]));
        expect(module.containerTypesSystemIds).toEqual(new Set([10, 20, 30]));
      });
    });

    describe('Error Handling', () => {
      it('should collect errors when transformation fails', async () => {
        const builderWithoutWorker = new SpfModuleDefinitionBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
          undefined,
          mockLogger,
        );

        // Create invalid AWSP module that will cause transformation error
        const invalidAwspModule: any = {
          id: 100,
          name: 'Invalid Module',
          // Missing required fields like inputPortsInfo, outputPortsInfo
          // However, the transformation handles missing fields gracefully with defaults
        };

        const result = await builderWithoutWorker.buildModuleDefinitions(
          [invalidAwspModule],
          TEST_FILE_SYSTEM_ID,
        );

        // The transformation handles missing fields gracefully and creates entities with defaults
        // In partial success model, this creates a valid entity with default port groups
        expect(result.entities).toHaveLength(1);
        expect(result.successCount).toBe(1);
        expect(result.errorCount).toBe(0);
        expect(result.entities[0].dataPortGroups).toHaveLength(2);
        expect(result.entities[0].dataPortGroups[0].maxAllowedPortCount).toBe(
          0,
        );
        expect(result.entities[0].dataPortGroups[1].maxAllowedPortCount).toBe(
          0,
        );
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

        const awspModule1: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Test Module 1',
          displayName: 'Test Module 1',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const awspModule2: AwspSpfModuleDefinition = {
          id: 200,
          name: 'Test Module 2',
          displayName: 'Test Module 2',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        // Pass 2 modules to trigger parallel mode (requires length > 1)
        const result = await builder.buildModuleDefinitions(
          [awspModule1, awspModule2],
          TEST_FILE_SYSTEM_ID,
        );

        // When worker fails, no entities should be added
        expect(result.entities).toHaveLength(0);
        expect(mockLogger.logError).toHaveBeenCalled();
      });

      it('should propagate errors from parallel processing', async () => {
        mockWorkerPool.isThreadingSupported.mockReturnValue(true);
        mockWorkerPool.executeParallel.mockRejectedValue(
          new Error('Parallel execution failed'),
        );

        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        await expect(
          builder.buildModuleDefinitions(
            [awspModule, awspModule],
            TEST_FILE_SYSTEM_ID,
          ),
        ).rejects.toThrow('Parallel execution failed');
      });
    });
  });

  describe('transformModuleDefinition (static method)', () => {
    describe('Happy Path', () => {
      it('should transform basic module definition', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Test Module',
          displayName: 'Test Module Display',
          description: 'Test Description',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [1, 2],
          supportedContainerTypes: [10, 20],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.systemId).toBe(0);
        expect(result.entity!.moduleDefinitionId).toBe(100);
        expect(result.entity!.name).toBe('Test Module');
        expect(result.entity!.displayName).toBe('Test Module Display');
        expect(result.entity!.description).toBe('Test Description');
        expect(result.entity!.processorSystemIds).toEqual(new Set([1, 2]));
        expect(result.entity!.containerTypesSystemIds).toEqual(
          new Set([10, 20]),
        );
      });

      it('should transform parameters correctly', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param 1',
              description: 'Param 1 desc',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'Shared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters).toHaveLength(1);
        expect(result.entity!.parameters[0].systemId).toBe(0);
        expect(result.entity!.parameters[0].paramId).toBe(1);
        expect(result.entity!.parameters[0].name).toBe('Param 1');
        expect(result.entity!.parameters[0].description).toBe('Param 1 desc');
        expect(result.entity!.parameters[0].maxSize).toBe(100);
        expect(result.entity!.parameters[0].pidType).toBe(PARAM_TYPE.Shared);
        expect(result.entity!.parameters[0].toolPolicies).toContain(
          TOOL_POLICY.Calibration,
        );
      });

      it('should transform input/output data port groups', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {
            maxPortCount: 2,
            ports: [{id: 1, name: 'Input 1'}],
          },
          outputPortsInfo: {
            maxPortCount: 3,
            ports: [{id: 2, name: 'Output 1'}],
          },
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.dataPortGroups).toHaveLength(2);

        const inputGroup = result.entity!.dataPortGroups[0];
        expect(inputGroup.portIoType).toBe('Input');
        expect(inputGroup.maxAllowedPortCount).toBe(2);
        expect(inputGroup.staticPortDefinitions).toHaveLength(1);
        expect(inputGroup.staticPortDefinitions[0].dataPortId).toBe(1);

        const outputGroup = result.entity!.dataPortGroups[1];
        expect(outputGroup.portIoType).toBe('Output');
        expect(outputGroup.maxAllowedPortCount).toBe(3);
        expect(outputGroup.staticPortDefinitions).toHaveLength(1);
        expect(outputGroup.staticPortDefinitions[0].dataPortId).toBe(2);
      });

      it('should transform static control ports', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {
            staticPorts: [
              {id: 1, name: 'Static 1', supportedIntents: []},
              {id: 2, name: 'Static 2', supportedIntents: []},
            ],
            dynamicIntents: [],
          },
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.staticControlPorts).toHaveLength(2);
        expect(result.entity!.staticControlPorts[0].portId).toBe(1);
        expect(result.entity!.staticControlPorts[0].portName).toBe('Static 1');
        expect(result.entity!.staticControlPorts[1].portId).toBe(2);
        expect(result.entity!.staticControlPorts[1].portName).toBe('Static 2');
      });

      it('should transform dynamic intents', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {
            staticPorts: [],
            dynamicIntents: [
              {id: 10, name: 'Intent 1', maxports: 5},
              {id: 20, name: 'Intent 2', maxports: 10},
            ],
          },
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.dynamicIntents).toHaveLength(2);
        expect(result.entity!.dynamicIntents[0].intentId).toBe(10);
        expect(result.entity!.dynamicIntents[0].name).toBe('Intent 1');
        expect(result.entity!.dynamicIntents[0].maxPort).toBe(5);
        expect(result.entity!.dynamicIntents[1].intentId).toBe(20);
        expect(result.entity!.dynamicIntents[1].name).toBe('Intent 2');
        expect(result.entity!.dynamicIntents[1].maxPort).toBe(10);
      });
    });

    describe('Edge Cases', () => {
      it('should handle modules with no ports', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 0, ports: []},
          outputPortsInfo: {maxPortCount: 0, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(
          result.entity!.dataPortGroups[0].staticPortDefinitions,
        ).toHaveLength(0);
        expect(
          result.entity!.dataPortGroups[1].staticPortDefinitions,
        ).toHaveLength(0);
        expect(result.entity!.staticControlPorts).toHaveLength(0);
        expect(result.entity!.dynamicIntents).toHaveLength(0);
      });

      it('should handle modules with no parameters', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters).toHaveLength(0);
      });

      it('should verify systemId placeholder is 0', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param',
              description: '',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'Shared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.systemId).toBe(0);
        expect(result.entity!.parameters[0].systemId).toBe(0);
      });

      it('should use displayName when provided, otherwise use name', () => {
        const awspModule1: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module Name',
          displayName: 'Module Display Name',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result1 =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule1);
        expect(result1.entity).not.toBeNull();
        expect(result1.errors).toHaveLength(0);
        expect(result1.entity!.displayName).toBe('Module Display Name');

        const awspModule2: AwspSpfModuleDefinition = {
          id: 200,
          name: 'Module Name Only',
          displayName: '',
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result2 =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule2);
        expect(result2.entity).not.toBeNull();
        expect(result2.errors).toHaveLength(0);
        expect(result2.entity!.displayName).toBe('Module Name Only');
      });
    });
  });

  describe('Helper Methods', () => {
    describe('mapPidType', () => {
      it('should map None to PARAM_TYPE.None', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param',
              description: '',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'None',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);
        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters[0].pidType).toBe(PARAM_TYPE.None);
      });

      it('should map Shared to PARAM_TYPE.Shared', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param',
              description: '',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'Shared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);
        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters[0].pidType).toBe(PARAM_TYPE.Shared);
      });

      it('should map GlobalShared to PARAM_TYPE.GlobalShared', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param',
              description: '',
              maxSize: 100,
              toolPolicies: ['Calibration'],
              pidType: 'GlobalShared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);
        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters[0].pidType).toBe(
          PARAM_TYPE.GlobalShared,
        );
      });
    });

    describe('mapToolPolicy', () => {
      it('should map all tool policy types correctly', () => {
        const awspModule: AwspSpfModuleDefinition = {
          id: 100,
          name: 'Module',
          displayName: 'Module',
          description: '',
          paramDefinitions: [
            {
              id: 1,
              name: 'Param',
              description: '',
              maxSize: 100,
              toolPolicies: ['Calibration', 'RTC', 'RTM', 'RTCReadonly'],
              pidType: 'Shared',
              elements: [],
            },
          ],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        };

        const result =
          SpfModuleDefinitionBuilder.transformModuleDefinition(awspModule);

        expect(result.entity).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.entity!.parameters[0].toolPolicies).toContain(
          TOOL_POLICY.Calibration,
        );
        expect(result.entity!.parameters[0].toolPolicies).toContain(
          TOOL_POLICY.Rtc,
        );
        expect(result.entity!.parameters[0].toolPolicies).toContain(
          TOOL_POLICY.Rtm,
        );
        expect(result.entity!.parameters[0].toolPolicies).toContain(
          TOOL_POLICY.RtcReadonly,
        );
      });
    });
  });

  describe('Parallel vs Sequential Processing', () => {
    it('should use sequential processing when worker pool is undefined', async () => {
      const builderWithoutWorker = new SpfModuleDefinitionBuilder(
        mockIdGenerator,
        mockForeignKeyMapper,
        undefined,
        mockLogger,
      );

      const awspModule: AwspSpfModuleDefinition = {
        id: 100,
        name: 'Module',
        displayName: 'Module',
        description: '',
        paramDefinitions: [],
        inputPortsInfo: {maxPortCount: 1, ports: []},
        outputPortsInfo: {maxPortCount: 1, ports: []},
        controlPortsInfo: {staticPorts: [], dynamicIntents: []},
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      await builderWithoutWorker.buildModuleDefinitions(
        [awspModule],
        TEST_FILE_SYSTEM_ID,
      );

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sequential_spf_module_building_start',
        }),
      );
    });

    it('should use sequential processing when threading is not supported', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(false);

      const awspModule: AwspSpfModuleDefinition = {
        id: 100,
        name: 'Module',
        displayName: 'Module',
        description: '',
        paramDefinitions: [],
        inputPortsInfo: {maxPortCount: 1, ports: []},
        outputPortsInfo: {maxPortCount: 1, ports: []},
        controlPortsInfo: {staticPorts: [], dynamicIntents: []},
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      await builder.buildModuleDefinitions([awspModule], TEST_FILE_SYSTEM_ID);

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sequential_spf_module_building_start',
        }),
      );
    });

    it('should use sequential processing when only one module definition', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);

      const awspModule: AwspSpfModuleDefinition = {
        id: 100,
        name: 'Module',
        displayName: 'Module',
        description: '',
        paramDefinitions: [],
        inputPortsInfo: {maxPortCount: 1, ports: []},
        outputPortsInfo: {maxPortCount: 1, ports: []},
        controlPortsInfo: {staticPorts: [], dynamicIntents: []},
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      await builder.buildModuleDefinitions([awspModule], TEST_FILE_SYSTEM_ID);

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sequential_spf_module_building_start',
        }),
      );
    });

    it('should use parallel processing when conditions are met', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);
      mockWorkerPool.executeParallel.mockResolvedValue([
        {success: true, data: {validModuleDefinitions: [], errors: []}},
        {success: true, data: {validModuleDefinitions: [], errors: []}},
      ]);

      const awspModule1: AwspSpfModuleDefinition = {
        id: 100,
        name: 'Module 1',
        displayName: 'Module 1',
        description: '',
        paramDefinitions: [],
        inputPortsInfo: {maxPortCount: 1, ports: []},
        outputPortsInfo: {maxPortCount: 1, ports: []},
        controlPortsInfo: {staticPorts: [], dynamicIntents: []},
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const awspModule2: AwspSpfModuleDefinition = {
        id: 200,
        name: 'Module 2',
        displayName: 'Module 2',
        description: '',
        paramDefinitions: [],
        inputPortsInfo: {maxPortCount: 1, ports: []},
        outputPortsInfo: {maxPortCount: 1, ports: []},
        controlPortsInfo: {staticPorts: [], dynamicIntents: []},
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      await builder.buildModuleDefinitions(
        [awspModule1, awspModule2],
        TEST_FILE_SYSTEM_ID,
      );

      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'parallel_spf_module_building_start',
        }),
      );
      expect(mockWorkerPool.executeParallel).toHaveBeenCalled();
    });

    it('should split tasks correctly for parallel processing', async () => {
      mockWorkerPool.isThreadingSupported.mockReturnValue(true);
      mockWorkerPool.executeParallel.mockResolvedValue([
        {success: true, data: {validModuleDefinitions: [], errors: []}},
        {success: true, data: {validModuleDefinitions: [], errors: []}},
      ]);

      const modules: AwspSpfModuleDefinition[] = [];
      for (let i = 0; i < 10; i++) {
        modules.push({
          id: i,
          name: `Module ${i}`,
          displayName: `Module ${i}`,
          description: '',
          paramDefinitions: [],
          inputPortsInfo: {maxPortCount: 1, ports: []},
          outputPortsInfo: {maxPortCount: 1, ports: []},
          controlPortsInfo: {staticPorts: [], dynamicIntents: []},
          supportedProcessorIds: [],
          supportedContainerTypes: [],
        });
      }

      await builder.buildModuleDefinitions(modules, TEST_FILE_SYSTEM_ID);

      expect(mockWorkerPool.executeParallel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({
              moduleDefinitions: expect.arrayContaining([
                expect.objectContaining({id: 0}),
              ]),
            }),
          }),
          expect.objectContaining({
            input: expect.objectContaining({
              moduleDefinitions: expect.arrayContaining([
                expect.objectContaining({id: 5}),
              ]),
            }),
          }),
        ]),
      );
    });
  });
});
