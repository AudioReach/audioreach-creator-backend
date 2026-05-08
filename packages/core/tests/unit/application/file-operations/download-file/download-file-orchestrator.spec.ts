/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DownloadFileOrchestrator} from '../../../../../src/application/file-operations/download-file/services/download-file-orchestrator.js';
import type {
  BulkReadRepository,
  DownloadEntities,
} from '../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';

const makeEmptyEntities = (): DownloadEntities => ({
  subgraphs: [],
  containers: [],
  modules: [],
  dataLinks: [],
  controlLinks: [],
  usecases: [],
  keyDefinitions: [],
  moduleDefinitions: [],
});

const makeMockBulkReadRepository = (
  entities: DownloadEntities = makeEmptyEntities(),
): BulkReadRepository => ({
  readAllEntitiesForFile: jest
    .fn<(fileSystemId: number) => Promise<DownloadEntities>>()
    .mockResolvedValue(entities),
});

describe('DownloadFileOrchestrator', () => {
  describe('orchestrate()', () => {
    it('calls BulkReadRepository.readAllEntitiesForFile with the given fileSystemId', async () => {
      const mockRepo = makeMockBulkReadRepository();
      const orchestrator = new DownloadFileOrchestrator(mockRepo);

      await expect(
        orchestrator.orchestrate(42, {acdb: 'test.acdb', awsp: 'test.awsp'}),
      ).rejects.toThrow(
        'AcdbFileSerializer.serialize() is not yet implemented',
      );

      expect(mockRepo.readAllEntitiesForFile).toHaveBeenCalledWith(42);
    });

    it('calls BulkReadRepository.readAllEntitiesForFile exactly once', async () => {
      const mockRepo = makeMockBulkReadRepository();
      const orchestrator = new DownloadFileOrchestrator(mockRepo);

      await expect(
        orchestrator.orchestrate(1, {acdb: 'a.acdb', awsp: 'a.awsp'}),
      ).rejects.toThrow();

      expect(mockRepo.readAllEntitiesForFile).toHaveBeenCalledTimes(1);
    });
  });
});
