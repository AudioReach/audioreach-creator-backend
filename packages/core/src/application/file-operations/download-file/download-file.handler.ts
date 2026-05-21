/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FileSystemPort} from '../../ports/file-system/file-system.port.js';
import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../services/query-services.js';
import type {DownloadFileQuery} from './download-file.query.js';
import {DownloadFileOrchestrator} from './services/download-file-orchestrator.js';

export type DownloadFileResult = {
  acdbFile: {name: string; fileType: string; content: Uint8Array};
  workspaceFile: {name: string; fileType: string; content: Uint8Array};
};

/**
 * Query handler for DownloadFileQuery.
 * Resolves fileSystemId and file names from projectId, then delegates to DownloadFileOrchestrator.
 */
export class DownloadFileHandler implements QueryHandler<
  DownloadFileQuery,
  Promise<DownloadFileResult>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async handle(query: DownloadFileQuery): Promise<DownloadFileResult> {
    // 1. Resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // 2. Resolve original file names
    const fileNames =
      await this.queryServices.projectQueryService.getFileNamesByProjectId(
        query.projectId,
      );

    // 3. Orchestrate download
    const orchestrator = new DownloadFileOrchestrator(
      this.queryServices.bulkReadRepository,
      this.fileSystem,
    );

    const result = await orchestrator.orchestrate(fileSystemId, fileNames);

    return {
      acdbFile: {
        name: fileNames.acdb,
        fileType: 'application/octet-stream',
        content: result.acdbBuffer,
      },
      workspaceFile: {
        name: fileNames.awsp,
        fileType: 'application/json',
        content: result.awspBuffer,
      },
    };
  }
}
