/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DownloadFileHandler} from '../../../../../src/application/file-operations/download-file/download-file.handler.js';
import {DownloadFileQuery} from '../../../../../src/application/file-operations/download-file/download-file.query.js';
import type {QueryServices} from '../../../../../src/application/services/query-services.js';
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

const makeMockQueryServices = (
  overrides?: Partial<QueryServices>,
): QueryServices => ({
  modulesQueryService: {} as any,
  useCaseQueryService: {} as any,
  validationQueryService: {} as any,
  projectQueryService: {
    getFileIdByProjectId: jest
      .fn<(projectId: number) => Promise<number>>()
      .mockResolvedValue(99),
    getFileNamesByProjectId: jest
      .fn<(projectId: number) => Promise<{acdb: string; awsp: string}>>()
      .mockResolvedValue({
        acdb: 'test.acdb',
        awsp: 'test.awsp',
      }),
  },
  bulkReadRepository: {
    readAllEntitiesForFile: jest
      .fn<(fileSystemId: number) => Promise<DownloadEntities>>()
      .mockResolvedValue(makeEmptyEntities()),
  } as BulkReadRepository,
  ...overrides,
});

describe('DownloadFileHandler', () => {
  describe('handle()', () => {
    it('resolves fileSystemId from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow(
        'AcdbFileSerializer.serialize() is not yet implemented',
      );

      expect(
        queryServices.projectQueryService.getFileIdByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('resolves file names from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow();

      expect(
        queryServices.projectQueryService.getFileNamesByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('calls BulkReadRepository with the resolved fileSystemId', async () => {
      const queryServices = makeMockQueryServices();
      const handler = new DownloadFileHandler(queryServices);
      const query = new DownloadFileQuery(7, 'client-1');

      await expect(handler.handle(query)).rejects.toThrow();

      expect(
        queryServices.bulkReadRepository.readAllEntitiesForFile,
      ).toHaveBeenCalledWith(99); // fileSystemId resolved from projectId 7
    });
  });
});
