/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {KeyDefinition} from '../../../../../domain/entities/definitions/key-value/key-definition.js';
import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {
  ACDBVersionInfo,
  CodecInfo,
} from '../../../../file-operations/shared/acdb-chunks/header-chunk.js';

/**
 * ACDB project header metadata from database.
 */
export interface ProjectHeaderMetadata {
  version: ACDBVersionInfo;
  codecInfos: CodecInfo[];
  modifiedDate: number;
  oemInfo: string;
}

/**
 * All domain entities needed to reconstruct .acdb and .awsp files for a given file.
 */
export interface DownloadEntities {
  subgraphs: Subgraph[];
  containers: Container[];
  modules: SpfModule[];
  dataLinks: DataLink[];
  controlLinks: ControlLink[];
  usecases: UseCase[];
  keyDefinitions: KeyDefinition[];
  moduleDefinitions: SpfModuleDefinition[];
  headerMetadata: ProjectHeaderMetadata;
}

/**
 * Port interface for reading all entities needed for file download.
 * Implementations run queries in parallel for performance.
 */
export interface BulkReadRepository {
  /**
   * Reads all entity types for a given file in parallel.
   * @param fileSystemId - The file system ID to scope the query
   */
  readAllEntitiesForFile(fileSystemId: number): Promise<DownloadEntities>;
}
