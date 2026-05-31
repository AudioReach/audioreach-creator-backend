/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DownloadFileOrchestrator} from '../../../../../src/application/file-operations/download-file/services/download-file-orchestrator.js';
import type {
  BulkReadQueryService,
  DownloadEntities,
} from '../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {createMockFileSystem} from '../../../../helpers/index.js';

const makeEmptyEntities = (): DownloadEntities => ({
  headerMetadata: {
    version: {
      major: 1,
      minor: 0,
      revision: 0,
      cplInfo: 0,
    },
    codecInfos: [],
    modifiedDate: Date.now(),
    oemInfo: '',
  },
});

const makeMockBulkReadQueryService = (
  entities: DownloadEntities = makeEmptyEntities(),
): BulkReadQueryService => ({
  readAllEntitiesForFile: jest
    .fn<(fileSystemId: number) => Promise<DownloadEntities>>()
    .mockResolvedValue(entities),
});

describe('DownloadFileOrchestrator', () => {
  describe('orchestrate()', () => {
    it('calls BulkReadQueryService.readAllEntitiesForFile with the given fileSystemId', async () => {
      const mockService = makeMockBulkReadQueryService();
      const mockFileSystem = createMockFileSystem();
      const orchestrator = new DownloadFileOrchestrator(
        mockService,
        mockFileSystem,
      );

      await orchestrator.orchestrate(42, {
        acdb: 'test.acdb',
        awsp: 'test.awsp',
      });

      expect(mockService.readAllEntitiesForFile).toHaveBeenCalledWith(42);
    });

    it('calls BulkReadQueryService.readAllEntitiesForFile exactly once', async () => {
      const mockService = makeMockBulkReadQueryService();
      const mockFileSystem = createMockFileSystem();
      const orchestrator = new DownloadFileOrchestrator(
        mockService,
        mockFileSystem,
      );

      await orchestrator.orchestrate(1, {acdb: 'a.acdb', awsp: 'a.awsp'});

      expect(mockService.readAllEntitiesForFile).toHaveBeenCalledTimes(1);
    });

    it('returns ACDB and AWSP buffers', async () => {
      const mockService = makeMockBulkReadQueryService();
      const mockFileSystem = createMockFileSystem();
      const orchestrator = new DownloadFileOrchestrator(
        mockService,
        mockFileSystem,
      );

      const result = await orchestrator.orchestrate(1, {
        acdb: 'a.acdb',
        awsp: 'a.awsp',
      });

      expect(result).toHaveProperty('acdbBuffer');
      expect(result.acdbBuffer).toBeInstanceOf(Uint8Array);
      expect(result.acdbBuffer.length).toBeGreaterThan(0);
    });
  });
});
