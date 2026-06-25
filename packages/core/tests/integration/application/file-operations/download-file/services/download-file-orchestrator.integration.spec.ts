/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {DownloadFileOrchestrator} from '../../../../../../src/application/file-operations/download-file/services/download-file-orchestrator.js';
import type {BulkReadQueryService} from '../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../../../../src/application/ports/file-system/file-system.port.js';

describe('DownloadFileOrchestrator - Integration Tests', () => {
  let orchestrator: DownloadFileOrchestrator;
  let mockBulkReadQueryService: BulkReadQueryService;
  let mockFileSystem: FileSystemPort;

  const mockEntities = {
    headerMetadata: {
      version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
      codecInfos: [],
      modifiedDate: Date.now(),
      oemInfo: 'Test OEM',
    },
    usecaseData: [],
    calibrationData: [],
  };

  beforeEach(() => {
    // Mock BulkReadQueryService
    mockBulkReadQueryService = {
      readAllEntitiesForFile: jest.fn().mockResolvedValue(mockEntities),
    } as unknown as BulkReadQueryService;

    // Mock FileSystemPort
    mockFileSystem = {
      zipToBuffer: jest.fn().mockResolvedValue(new Uint8Array([7, 8, 9])),
    } as unknown as FileSystemPort;
  });

  describe('Sequential Mode (No Worker Pool)', () => {
    beforeEach(() => {
      orchestrator = new DownloadFileOrchestrator(
        mockBulkReadQueryService,
        mockFileSystem,
      );
    });

    it('should serialize files sequentially when no worker pool provided', async () => {
      const result = await orchestrator.orchestrate(1, {
        acdb: 'test.acdb',
        awsp: 'test.awsp',
      });

      expect(result).toBeDefined();
      expect(result.acdbBuffer).toBeInstanceOf(Uint8Array);
      expect(result.awspBuffer).toBeInstanceOf(Uint8Array);
      expect(
        mockBulkReadQueryService.readAllEntitiesForFile,
      ).toHaveBeenCalledWith(1);
    });

    it('should handle empty entities gracefully', async () => {
      const emptyEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: Date.now(),
          oemInfo: 'Test OEM',
        },
        usecaseData: [],
        calibrationData: [],
      };

      jest
        .mocked(mockBulkReadQueryService.readAllEntitiesForFile)
        .mockResolvedValue(emptyEntities);

      const result = await orchestrator.orchestrate(1, {
        acdb: 'test.acdb',
        awsp: 'test.awsp',
      });

      expect(result).toBeDefined();
      expect(result.acdbBuffer).toBeInstanceOf(Uint8Array);
      expect(result.awspBuffer).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      orchestrator = new DownloadFileOrchestrator(
        mockBulkReadQueryService,
        mockFileSystem,
      );
    });

    it('should propagate database read errors', async () => {
      jest
        .mocked(mockBulkReadQueryService.readAllEntitiesForFile)
        .mockRejectedValue(new Error('Database error'));

      await expect(
        orchestrator.orchestrate(1, {
          acdb: 'test.acdb',
          awsp: 'test.awsp',
        }),
      ).rejects.toThrow('Database error');
    });

    it('should propagate serialization errors', async () => {
      jest
        .mocked(mockFileSystem.zipToBuffer)
        .mockRejectedValue(new Error('ZIP creation failed'));

      await expect(
        orchestrator.orchestrate(1, {
          acdb: 'test.acdb',
          awsp: 'test.awsp',
        }),
      ).rejects.toThrow();
    });
  });
});
