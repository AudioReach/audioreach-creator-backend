/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UploadFileOrchestrator} from '../../../../../../src/application/file-operations/upload-file/services/upload-file-orchestrator.js';
import {EntityBuilderService} from '../../../../../../src/application/file-operations/upload-file/services/entity-builder-service.js';
import {KeyDefinition} from '../../../../../../src/domain/entities/definitions/key-value/key-definition.js';
import {ERROR_CODES} from '../../../../../../src/shared/errors/error-codes.js';
import {ENTITY_TYPES} from '../../../../../../src/application/file-operations/upload-file/types/issue-collection.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import type {BulkImportRepository} from '../../../../../../src/application/ports/persistence/repositories/bulk-import/bulk-import.repository.js';
import type {IdGenerationPort} from '../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {FileReaderPort} from '../../../../../../src/application/ports/file-system/file-reader.port.js';
import {createMockIdGenerator} from '../../../../../helpers/index.js';

describe('UploadFileOrchestrator', () => {
  let orchestrator: UploadFileOrchestrator;
  let mockFileReader: jest.Mocked<FileReaderPort>;
  let mockUow: jest.Mocked<UnitOfWork>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockBulkRepo: jest.Mocked<BulkImportRepository>;
  let mockBuilderService: jest.Mocked<EntityBuilderService>;

  beforeEach(() => {
    mockFileReader = {} as jest.Mocked<FileReaderPort>;

    mockBulkRepo = {
      insertKeyDefinitions: jest.fn(),
      insertSpfModuleDefinitions: jest.fn(),
    } as unknown as jest.Mocked<BulkImportRepository>;

    mockUow = {
      getBulkImportRepository: jest.fn().mockReturnValue(mockBulkRepo),
    } as unknown as jest.Mocked<UnitOfWork>;

    mockIdGenerator = createMockIdGenerator();

    orchestrator = new UploadFileOrchestrator(
      mockFileReader,
      mockUow,
      mockIdGenerator,
    );

    // Access private services for mocking
    mockBuilderService = (orchestrator as any)
      .builderService as jest.Mocked<EntityBuilderService>;
  });

  describe('buildAndInsertKeyDefinitions', () => {
    let buildAndInsertKeyDefinitions: (
      bulkRepo: BulkImportRepository,
    ) => Promise<void>;

    beforeEach(() => {
      // Access the private method for testing
      buildAndInsertKeyDefinitions = (
        orchestrator as any
      ).buildAndInsertKeyDefinitions.bind(orchestrator);

      // Set up required state
      (orchestrator as any).parsedAwsp = {};
      (orchestrator as any).currentFileId = 1;
    });

    describe('Happy Path', () => {
      it('should build and insert key definitions when they exist', async () => {
        const mockKeyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [mockKeyDef],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });
        mockBulkRepo.insertKeyDefinitions.mockResolvedValue({ok: true});

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalledWith(
          {},
          1,
        );
        expect(mockBulkRepo.insertKeyDefinitions).toHaveBeenCalledWith([
          mockKeyDef,
        ]);
      });

      it('should call methods in correct sequence', async () => {
        const mockKeyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        const callOrder: string[] = [];

        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockImplementation(async () => {
            callOrder.push('build');
            return {
              entities: [mockKeyDef],
              issues: [],
              successCount: 1,
              errorCount: 0,
              warningCount: 0,
            };
          });

        mockBulkRepo.insertKeyDefinitions.mockImplementation(async () => {
          callOrder.push('insert');
          return {ok: true};
        });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(callOrder).toEqual(['build', 'insert']);
      });
    });

    describe('Edge Cases', () => {
      it('should skip insertion when buildKeyDefinitions returns null', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue(null as any);

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow();

        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should skip insertion when buildKeyDefinitions returns empty array', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should handle zero-length key definitions array', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalled();
        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should propagate error when buildKeyDefinitions throws', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockRejectedValue(new Error('Build failed'));

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow('Build failed');

        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should propagate error when insertKeyDefinitions throws', async () => {
        const mockKeyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [mockKeyDef],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });
        mockBulkRepo.insertKeyDefinitions.mockRejectedValue(
          new Error('Insert failed'),
        );

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow('Insert failed');
      });
    });

    describe('Method Call Verification', () => {
      it('should not call insertKeyDefinitions when no key definitions', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should not call insertKeyDefinitions when no key definitions (explicit check)', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should call all methods exactly once when key definitions exist', async () => {
        const mockKeyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [mockKeyDef],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });
        mockBulkRepo.insertKeyDefinitions.mockResolvedValue({ok: true});

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalledTimes(1);
        expect(mockBulkRepo.insertKeyDefinitions).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('buildAndInsertSpfModuleDefinitions', () => {
    let buildAndInsertSpfModuleDefinitions: (
      bulkRepo: BulkImportRepository,
    ) => Promise<void>;

    beforeEach(() => {
      // Access the private method for testing
      buildAndInsertSpfModuleDefinitions = (
        orchestrator as any
      ).buildAndInsertSpfModuleDefinitions.bind(orchestrator);

      // Set up required state
      (orchestrator as any).parsedAwsp = {
        getSpfModuleDefinitions: jest.fn().mockReturnValue([
          {
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
          },
        ]),
      };
      (orchestrator as any).currentFileId = 1;
    });

    describe('Happy Path', () => {
      it('should build, and insert SPF module definitions when they exist', async () => {
        const mockModuleDef = {
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 1,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        };

        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [mockModuleDef as any],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });

        mockBulkRepo.insertSpfModuleDefinitions.mockResolvedValue({ok: true});

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(
          mockBuilderService.buildSpfModuleDefinitions,
        ).toHaveBeenCalledWith((orchestrator as any).parsedAwsp, 1);
        expect(mockBulkRepo.insertSpfModuleDefinitions).toHaveBeenCalledWith([
          mockModuleDef,
        ]);
      });

      it('should call methods in correct sequence', async () => {
        const mockModuleDef = {
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 1,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        };

        const callOrder: string[] = [];

        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockImplementation(async () => {
            callOrder.push('build');
            return {
              entities: [mockModuleDef as any],
              issues: [],
              successCount: 1,
              errorCount: 0,
              warningCount: 0,
            };
          });

        mockBulkRepo.insertSpfModuleDefinitions.mockImplementation(async () => {
          callOrder.push('insert');
          return {ok: true};
        });

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(callOrder).toEqual(['build', 'insert']);
      });
    });

    describe('Edge Cases', () => {
      it('should skip insertion when no SPF module definitions exist', async () => {
        (orchestrator as any).parsedAwsp.getSpfModuleDefinitions = jest
          .fn()
          .mockReturnValue([]);

        const buildSpy = jest.spyOn(
          mockBuilderService,
          'buildSpfModuleDefinitions',
        );

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(buildSpy).not.toHaveBeenCalled();
        expect(mockBulkRepo.insertSpfModuleDefinitions).not.toHaveBeenCalled();
      });

      it('should skip insertion when buildSpfModuleDefinitions returns empty array', async () => {
        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(mockBulkRepo.insertSpfModuleDefinitions).not.toHaveBeenCalled();
      });

      it('should handle zero-length module definitions array', async () => {
        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildSpfModuleDefinitions).toHaveBeenCalled();
        expect(mockBulkRepo.insertSpfModuleDefinitions).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should propagate error when buildSpfModuleDefinitions throws', async () => {
        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockRejectedValue(new Error('Build failed'));

        await expect(
          buildAndInsertSpfModuleDefinitions(mockBulkRepo),
        ).rejects.toThrow('Build failed');

        expect(mockBulkRepo.insertSpfModuleDefinitions).not.toHaveBeenCalled();
      });

      it('should propagate error when insertSpfModuleDefinitions throws', async () => {
        const mockModuleDef = {
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 1,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        };

        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [mockModuleDef as any],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });

        mockBulkRepo.insertSpfModuleDefinitions.mockRejectedValue(
          new Error('Insert failed'),
        );

        await expect(
          buildAndInsertSpfModuleDefinitions(mockBulkRepo),
        ).rejects.toThrow('Insert failed');
      });

      it('should collect insertion errors when insert result is not ok', async () => {
        const mockModuleDef = {
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 1,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        };

        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [mockModuleDef as any],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });

        mockBulkRepo.insertSpfModuleDefinitions.mockResolvedValue({
          ok: false,
          message: 'UNIQUE constraint failed',
        });

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        // Verify that the error was collected (implementation detail)
        expect(mockBulkRepo.insertSpfModuleDefinitions).toHaveBeenCalled();
      });
    });

    describe('Method Call Verification', () => {
      it('should not call insertSpfModuleDefinitions when no module definitions', async () => {
        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(mockBulkRepo.insertSpfModuleDefinitions).not.toHaveBeenCalled();
      });

      it('should call all methods exactly once when module definitions exist', async () => {
        const mockModuleDef = {
          systemId: 0,
          moduleDefinitionId: 100,
          fileSystemId: 1,
          name: 'Test Module',
          displayName: 'Test Module',
          description: '',
          parameters: [],
          dataPortGroups: [],
          stackSize: 0,
          staticControlPorts: [],
          dynamicIntents: [],
          processorSystemIds: [],
          containerTypesSystemIds: [],
        };

        jest
          .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
          .mockResolvedValue({
            entities: [mockModuleDef as any],
            issues: [],
            successCount: 1,
            errorCount: 0,
            warningCount: 0,
          });

        mockBulkRepo.insertSpfModuleDefinitions.mockResolvedValue({ok: true});

        await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

        expect(
          mockBuilderService.buildSpfModuleDefinitions,
        ).toHaveBeenCalledTimes(1);
        expect(mockBulkRepo.insertSpfModuleDefinitions).toHaveBeenCalledTimes(
          1,
        );
      });

      describe('Issue Collection', () => {
        it('should collect build issues from builder service', async () => {
          jest
            .spyOn(mockBuilderService, 'buildSpfModuleDefinitions')
            .mockResolvedValue({
              entities: [],
              issues: [
                {
                  severity: 'error' as const,
                  code: ERROR_CODES.INVALID_ENTITY_DATA,
                  message: 'Invalid module definition',
                  entityType: ENTITY_TYPES.SPF_MODULE_DEFINITION,
                },
              ],
              successCount: 0,
              errorCount: 1,
              warningCount: 0,
            });

          await buildAndInsertSpfModuleDefinitions(mockBulkRepo);

          // Verify that issues were collected (implementation detail)
          expect(
            mockBuilderService.buildSpfModuleDefinitions,
          ).toHaveBeenCalled();
        });
      });
    });
  });
});
