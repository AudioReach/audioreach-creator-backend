/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UploadFileOrchestrator} from '../../../../../../src/application/file-operations/upload-file/services/upload-file-orchestrator.js';
import {EntityBuilderService} from '../../../../../../src/application/file-operations/upload-file/services/entity-builder-service.js';
import {EntitySystemIdService} from '../../../../../../src/application/file-operations/upload-file/services/entity-system-id-service.js';
import {KeyDefinition} from '../../../../../../src/domain/entities/definitions/key-value/key-definition.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import type {BulkImportRepository} from '../../../../../../src/application/ports/persistence/repositories/bulk-import/bulk-import.repository.js';
import type {IdGenerationPort} from '../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {FileReaderPort} from '../../../../../../src/application/ports/file-system/file-reader.port.js';

describe('UploadFileOrchestrator', () => {
  let orchestrator: UploadFileOrchestrator;
  let mockFileReader: jest.Mocked<FileReaderPort>;
  let mockUow: jest.Mocked<UnitOfWork>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockBulkRepo: jest.Mocked<BulkImportRepository>;
  let mockBuilderService: jest.Mocked<EntityBuilderService>;
  let mockSystemIdService: jest.Mocked<EntitySystemIdService>;

  beforeEach(() => {
    mockFileReader = {} as jest.Mocked<FileReaderPort>;

    mockBulkRepo = {
      insertKeyDefinitions: jest.fn(),
    } as unknown as jest.Mocked<BulkImportRepository>;

    mockUow = {
      getBulkImportRepository: jest.fn().mockReturnValue(mockBulkRepo),
    } as unknown as jest.Mocked<UnitOfWork>;

    mockIdGenerator = {
      getNextId: jest.fn(),
      reserveBlock: jest.fn(),
      persistLastUsedId: jest.fn(),
    } as jest.Mocked<IdGenerationPort>;

    orchestrator = new UploadFileOrchestrator(
      mockFileReader,
      mockUow,
      mockIdGenerator,
    );

    // Access private services for mocking
    mockBuilderService = (orchestrator as any)
      .builderService as jest.Mocked<EntityBuilderService>;
    mockSystemIdService = (orchestrator as any)
      .entitySystemIdService as jest.Mocked<EntitySystemIdService>;
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
      it('should build, assign IDs, and insert key definitions when they exist', async () => {
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
        jest
          .spyOn(mockSystemIdService, 'assignSystemIdsToKeyDefinitions')
          .mockResolvedValue([mockKeyDef]);
        mockBulkRepo.insertKeyDefinitions.mockResolvedValue({
          status: 'SUCCESS',
          errors: [],
          insertSummary: {
            totalEntities: 1,
            successfulEntities: 1,
            failedEntities: 0,
          },
        });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalledWith({});
        expect(
          mockSystemIdService.assignSystemIdsToKeyDefinitions,
        ).toHaveBeenCalledWith([mockKeyDef], 1);
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

        jest
          .spyOn(mockSystemIdService, 'assignSystemIdsToKeyDefinitions')
          .mockImplementation(async () => {
            callOrder.push('assignIds');
            return [mockKeyDef];
          });

        mockBulkRepo.insertKeyDefinitions.mockImplementation(async () => {
          callOrder.push('insert');
          return {
            status: 'SUCCESS',
            errors: [],
            insertSummary: {
              totalEntities: 1,
              successfulEntities: 1,
              failedEntities: 0,
            },
          };
        });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(callOrder).toEqual(['build', 'assignIds', 'insert']);
      });
    });

    describe('Edge Cases', () => {
      it('should skip insertion when buildKeyDefinitions returns null', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue(null as any);
        const assignSpy = jest.spyOn(
          mockSystemIdService,
          'assignSystemIdsToKeyDefinitions',
        );

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow();

        expect(assignSpy).not.toHaveBeenCalled();
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
        const assignSpy = jest.spyOn(
          mockSystemIdService,
          'assignSystemIdsToKeyDefinitions',
        );

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(assignSpy).not.toHaveBeenCalled();
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
        const assignSpy = jest.spyOn(
          mockSystemIdService,
          'assignSystemIdsToKeyDefinitions',
        );

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalled();
        expect(assignSpy).not.toHaveBeenCalled();
        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should propagate error when buildKeyDefinitions throws', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockRejectedValue(new Error('Build failed'));
        const assignSpy = jest.spyOn(
          mockSystemIdService,
          'assignSystemIdsToKeyDefinitions',
        );

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow('Build failed');

        expect(assignSpy).not.toHaveBeenCalled();
        expect(mockBulkRepo.insertKeyDefinitions).not.toHaveBeenCalled();
      });

      it('should propagate error when assignSystemIds throws', async () => {
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
        jest
          .spyOn(mockSystemIdService, 'assignSystemIdsToKeyDefinitions')
          .mockRejectedValue(new Error('ID assignment failed'));

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow('ID assignment failed');

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
        jest
          .spyOn(mockSystemIdService, 'assignSystemIdsToKeyDefinitions')
          .mockResolvedValue([mockKeyDef]);
        mockBulkRepo.insertKeyDefinitions.mockRejectedValue(
          new Error('Insert failed'),
        );

        await expect(
          buildAndInsertKeyDefinitions(mockBulkRepo),
        ).rejects.toThrow('Insert failed');
      });
    });

    describe('Method Call Verification', () => {
      it('should not call assignSystemIds when no key definitions', async () => {
        jest
          .spyOn(mockBuilderService, 'buildKeyDefinitions')
          .mockResolvedValue({
            entities: [],
            issues: [],
            successCount: 0,
            errorCount: 0,
            warningCount: 0,
          });
        const assignSpy = jest.spyOn(
          mockSystemIdService,
          'assignSystemIdsToKeyDefinitions',
        );

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(assignSpy).not.toHaveBeenCalled();
      });

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
        jest
          .spyOn(mockSystemIdService, 'assignSystemIdsToKeyDefinitions')
          .mockResolvedValue([mockKeyDef]);
        mockBulkRepo.insertKeyDefinitions.mockResolvedValue({
          status: 'SUCCESS',
          errors: [],
          insertSummary: {
            totalEntities: 1,
            successfulEntities: 1,
            failedEntities: 0,
          },
        });

        await buildAndInsertKeyDefinitions(mockBulkRepo);

        expect(mockBuilderService.buildKeyDefinitions).toHaveBeenCalledTimes(1);
        expect(
          mockSystemIdService.assignSystemIdsToKeyDefinitions,
        ).toHaveBeenCalledTimes(1);
        expect(mockBulkRepo.insertKeyDefinitions).toHaveBeenCalledTimes(1);
      });
    });
  });
});
