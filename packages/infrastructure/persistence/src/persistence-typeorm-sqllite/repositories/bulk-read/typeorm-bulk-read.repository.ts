/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BulkReadRepository,
  DownloadEntities,
  ProjectHeaderMetadata,
} from '@arc/core';
import type {DataSource} from 'typeorm';
import {DbFileQuery} from '../../queries/db-file-query.js';

/**
 * TypeORM implementation of BulkReadRepository.
 * Reads all entity types for a file in parallel using Promise.all.
 *
 * Individual query methods are deferred to Phase 4 of the download-file plan.
 */
export class TypeOrmBulkReadRepository implements BulkReadRepository {
  constructor(
    // dataSource will be used in Phase 4 when implementing individual query methods
    private readonly dataSource: DataSource,
  ) {
    // Validate dataSource is provided (also satisfies TypeScript unused check)
    if (!this.dataSource) {
      throw new Error('DataSource is required');
    }
  }

  async readAllEntitiesForFile(
    fileSystemId: number,
  ): Promise<DownloadEntities> {
    const headerMetadata = await this.readProjectHeader(fileSystemId);
    return {
      headerMetadata,
    };
  }

  /**
   * Read ACDB project header metadata from the files table.
   * Returns header information persisted during upload.
   *
   * @param fileSystemId - The file system ID to query
   * @returns ProjectHeaderMetadata object with version, codecs, OEM info, etc.
   * @throws Error if file not found
   */
  async readProjectHeader(
    fileSystemId: number,
  ): Promise<ProjectHeaderMetadata> {
    return new DbFileQuery(this.dataSource).readProjectHeader(fileSystemId);
  }
}
