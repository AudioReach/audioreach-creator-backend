/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DriverModuleDefinitionBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/driver-module-definition-builder.js';
import type {DriverModuleDefinition as AwspDriverModuleDefinition} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/index.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {IssueSeverity} from '../../../../../../../src/shared/issues/index.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';

describe('DriverModuleDefinitionBuilder', () => {
  let builder: DriverModuleDefinitionBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    builder = new DriverModuleDefinitionBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildDriverModuleDefinitions', () => {
    describe('Happy Path', () => {
      it('should build driver module definitions from AWSP data', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Driver Module 1',
            displayName: 'Driver Module 1 Display',
            description: 'Test driver module',
            parameters: [],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(1);
        expect(result.issues).toHaveLength(0);
        expect(result.entities[0].moduleDefinitionId).toBe(100);
        expect(result.entities[0].name).toBe('Driver Module 1');
        expect(result.entities[0].displayName).toBe('Driver Module 1 Display');
        expect(result.entities[0].systemId).toBeGreaterThan(0);
        expect(result.entities[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(
          mockForeignKeyMapper.addDriverModuleDefinitionMapping,
        ).toHaveBeenCalledTimes(1);
      });

      it('should use name as displayName when displayName not provided', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Driver Module',
            displayName: '',
            description: '',
            parameters: [],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].displayName).toBe('Driver Module');
      });

      it('should build parameter definitions', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Driver Module',
            displayName: 'Driver Module',
            description: '',
            parameters: [
              {
                id: 1,
                name: 'Param 1',
                description: 'Parameter 1',
                maxSize: 100,
                elements: [],
              },
              {
                id: 2,
                name: 'Param 2',
                description: 'Parameter 2',
                maxSize: 200,
                elements: [],
              },
            ],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters).toHaveLength(2);
        expect(result.entities[0].parameters[0].parameterId).toBe(1);
        expect(result.entities[0].parameters[0].name).toBe('Param 1');
        expect(result.entities[0].parameters[0].maxSize).toBe(100);
        expect(result.entities[0].parameters[1].parameterId).toBe(2);
        expect(result.entities[0].parameters[1].name).toBe('Param 2');
        expect(result.entities[0].parameters[1].maxSize).toBe(200);
        expect(
          mockForeignKeyMapper.addDriverParamDefinitionMapping,
        ).toHaveBeenCalledTimes(2);
      });

      it('should assign system IDs to parameters', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Driver Module',
            displayName: 'Driver Module',
            description: '',
            parameters: [
              {
                id: 1,
                name: 'Param 1',
                description: '',
                maxSize: 100,
                elements: [],
              },
            ],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters[0].systemId).toBeGreaterThan(0);
      });

      it('should handle multiple module definitions', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module 1',
            displayName: 'Module 1',
            description: '',
            parameters: [],
          },
          {
            id: 200,
            name: 'Module 2',
            displayName: 'Module 2',
            description: '',
            parameters: [],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2);
        expect(result.entities[0].moduleDefinitionId).toBe(100);
        expect(result.entities[1].moduleDefinitionId).toBe(200);
      });

      it('should serialize parameter elements structure', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module',
            displayName: 'Module',
            description: '',
            parameters: [
              {
                id: 1,
                name: 'Param',
                description: '',
                maxSize: 100,
                elements: [{name: 'field1', type: 'uint32'}],
              },
            ],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters[0].paramStructure).toContain(
          'field1',
        );
        expect(result.entities[0].parameters[0].paramStructure).toContain(
          'uint32',
        );
      });
    });

    describe('Edge Cases', () => {
      it('should return empty result when input is empty', async () => {
        const result = await builder.buildDriverModuleDefinitions(
          [],
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.issues).toHaveLength(0);
      });

      it('should return empty result when input is null', async () => {
        const result = await builder.buildDriverModuleDefinitions(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
      });

      it('should return empty result when input is undefined', async () => {
        const result = await builder.buildDriverModuleDefinitions(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
      });

      it('should handle module with no parameters', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module',
            displayName: 'Module',
            description: '',
            parameters: [],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters).toHaveLength(0);
      });

      it('should handle parameter with no maxSize', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module',
            displayName: 'Module',
            description: '',
            parameters: [
              {
                id: 1,
                name: 'Param',
                description: '',
                maxSize: undefined,
                elements: [],
              },
            ],
          },
        ] as any;

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities[0].parameters[0].maxSize).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should collect error when module definition build fails', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module',
            displayName: 'Module',
            description: '',
            parameters: [],
          },
        ] as any;

        // Force an error by making getNextId throw
        mockIdGenerator.getNextId.mockRejectedValueOnce(
          new Error('ID generation failed'),
        );

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(0);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].severity).toBe(IssueSeverity.Error);
      });

      it('should collect error when parameter build fails', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module',
            displayName: 'Module',
            description: '',
            parameters: [
              {
                id: 1,
                name: 'Param',
                description: '',
                maxSize: 100,
                elements: [],
              },
            ],
          },
        ] as any;

        // First call succeeds (module), second call fails (parameter)
        mockIdGenerator.getNextId
          .mockResolvedValueOnce(1000)
          .mockRejectedValueOnce(new Error('Param ID generation failed'));

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        // Module is still created but parameter fails
        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].parameters).toHaveLength(0);
        expect(result.issues).toHaveLength(1);
      });

      it('should continue building after individual module failure', async () => {
        const awspDefinitions = [
          {
            id: 100,
            name: 'Module 1',
            displayName: 'Module 1',
            description: '',
            parameters: [],
          },
          {
            id: 200,
            name: 'Module 2',
            displayName: 'Module 2',
            description: '',
            parameters: [],
          },
          {
            id: 300,
            name: 'Module 3',
            displayName: 'Module 3',
            description: '',
            parameters: [],
          },
        ] as any;

        // First succeeds, second fails, third succeeds
        mockIdGenerator.getNextId
          .mockResolvedValueOnce(1000)
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce(3000);

        const result = await builder.buildDriverModuleDefinitions(
          awspDefinitions,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result.entities).toHaveLength(2); // Module 1 and 3 succeed
        expect(result.issues).toHaveLength(1);
      });
    });
  });
});
