/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkReadRepository, DownloadEntities} from '@arc/core';
import type {DataSource} from 'typeorm';

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
    const [
      subgraphs,
      containers,
      modules,
      dataLinks,
      controlLinks,
      usecases,
      keyDefinitions,
      moduleDefinitions,
    ] = await Promise.all([
      this.findSubgraphs(fileSystemId),
      this.findContainers(fileSystemId),
      this.findModules(fileSystemId),
      this.findDataLinks(fileSystemId),
      this.findControlLinks(fileSystemId),
      this.findUsecases(fileSystemId),
      this.findKeyDefinitions(fileSystemId),
      this.findModuleDefinitions(fileSystemId),
    ]);

    return {
      subgraphs,
      containers,
      modules,
      dataLinks,
      controlLinks,
      usecases,
      keyDefinitions,
      moduleDefinitions,
    };
  }

  // ─── Individual query methods (Phase 4) ──────────────────────────────────

  private findSubgraphs(
    _fileSystemId: number,
  ): Promise<DownloadEntities['subgraphs']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findSubgraphs() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findContainers(
    _fileSystemId: number,
  ): Promise<DownloadEntities['containers']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findContainers() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findModules(
    _fileSystemId: number,
  ): Promise<DownloadEntities['modules']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findModules() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findDataLinks(
    _fileSystemId: number,
  ): Promise<DownloadEntities['dataLinks']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findDataLinks() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findControlLinks(
    _fileSystemId: number,
  ): Promise<DownloadEntities['controlLinks']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findControlLinks() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findUsecases(
    _fileSystemId: number,
  ): Promise<DownloadEntities['usecases']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findUsecases() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findKeyDefinitions(
    _fileSystemId: number,
  ): Promise<DownloadEntities['keyDefinitions']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findKeyDefinitions() not yet implemented. See Phase 4.',
      ),
    );
  }

  private findModuleDefinitions(
    _fileSystemId: number,
  ): Promise<DownloadEntities['moduleDefinitions']> {
    return Promise.reject(
      new Error(
        'TypeOrmBulkReadRepository.findModuleDefinitions() not yet implemented. See Phase 4.',
      ),
    );
  }
}
