/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DownloadFileHandler} from '../../../../../src/application/file-operations/download-file/download-file.handler.js';
import {DownloadFileQuery} from '../../../../../src/application/file-operations/download-file/download-file.query.js';
import type {QueryServices} from '../../../../../src/application/services/query-services.js';
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
    getProjectHeader: jest
      .fn<
        (projectId: number) => Promise<{
          headerVersion: number;
          acdbVersion: {
            major: number;
            minor: number;
            revision: number;
            cplInfo: number;
          };
          codecInfos: string;
          modifiedDate: number;
          oemInfo: string;
        }>
      >()
      .mockResolvedValue({
        headerVersion: 1,
        acdbVersion: {
          major: 1,
          minor: 0,
          revision: 0,
          cplInfo: 0,
        },
        codecInfos: '[]',
        modifiedDate: Date.now(),
        oemInfo: '',
      }),
  },
  bulkReadQueryService: {
    readAllEntitiesForFile: jest
      .fn<(fileSystemId: number) => Promise<DownloadEntities>>()
      .mockResolvedValue(makeEmptyEntities()),
  } as BulkReadQueryService,
  ...overrides,
});

describe('DownloadFileHandler', () => {
  describe('handle()', () => {
    it('resolves fileSystemId from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const mockFileSystem = createMockFileSystem();
      const handler = new DownloadFileHandler(queryServices, mockFileSystem);
      const query = new DownloadFileQuery(7, 'client-1');

      await handler.handle(query);

      expect(
        queryServices.projectQueryService.getFileIdByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('resolves file names from projectId before orchestrating', async () => {
      const queryServices = makeMockQueryServices();
      const mockFileSystem = createMockFileSystem();
      const handler = new DownloadFileHandler(queryServices, mockFileSystem);
      const query = new DownloadFileQuery(7, 'client-1');

      await handler.handle(query);

      expect(
        queryServices.projectQueryService.getFileNamesByProjectId,
      ).toHaveBeenCalledWith(7);
    });

    it('calls BulkReadQueryService with the resolved fileSystemId', async () => {
      const queryServices = makeMockQueryServices();
      const mockFileSystem = createMockFileSystem();
      const handler = new DownloadFileHandler(queryServices, mockFileSystem);
      const query = new DownloadFileQuery(7, 'client-1');

      await handler.handle(query);

      expect(
        queryServices.bulkReadQueryService.readAllEntitiesForFile,
      ).toHaveBeenCalledWith(99); // fileSystemId resolved from projectId 7
    });

    it('returns download result with acdb and workspace files', async () => {
      const queryServices = makeMockQueryServices();
      const mockFileSystem = createMockFileSystem();
      const handler = new DownloadFileHandler(queryServices, mockFileSystem);
      const query = new DownloadFileQuery(7, 'client-1');

      const result = await handler.handle(query);

      expect(result).toHaveProperty('acdbFile');
      expect(result.acdbFile).toHaveProperty('name', 'test.acdb');
      expect(result.acdbFile).toHaveProperty(
        'fileType',
        'application/octet-stream',
      );
      expect(result.acdbFile.content).toBeInstanceOf(Uint8Array);
      expect(result.acdbFile.content.length).toBeGreaterThan(0);

      expect(result).toHaveProperty('workspaceFile');
      expect(result.workspaceFile).toHaveProperty('name', 'test.awsp');
      expect(result.workspaceFile).toHaveProperty(
        'fileType',
        'application/json',
      );
    });
  });
});
