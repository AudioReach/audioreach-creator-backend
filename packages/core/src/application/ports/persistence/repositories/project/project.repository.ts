/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ArcDbFile,
  ArcDbFileInit,
  FileOpenStatus,
} from '../../../../../domain/entities/usecase-data/project/arc-db-file.js';
import type {Project} from '../../../../../domain/entities/usecase-data/project/project.js';
import type {ValidationIssue} from '../../../../../domain/validation/issue.js';
import type {Result} from '../../../../shared/result/result.js';
import type {ModulePortStrategy} from '../../../../../domain/entities/common/enums/module-port-strategy.js';

export interface ProjectCreationResult {
  project: Project;
  file: ArcDbFile;
}

export interface FileHeaderData {
  headerVersion: number;
  acdbVersionMajor: number;
  acdbVersionMinor: number;
  acdbVersionRevision: number;
  acdbVersionCplInfo: number;
  codecInfos: string;
  modifiedDate: number;
  oemInfo: string;
}

export interface ProjectRepository {
  /**
   * Insert a new offline project and its initial file in a single operation.
   * Both rows are covered by the caller's active transaction.
   * Returns `Result.fail(...)` (never throws) so the caller can manage rollback explicitly.
   * DB errors surface as an Issue with `code: 'DB_ERROR'` (see IssueFactory.dbError).
   */
  createOfflineProject(
    projectName: string,
    projectDescription: string,
    file: Omit<ArcDbFileInit, 'systemId'>,
  ): Promise<Result<ProjectCreationResult>>;

  /**
   * Update open_status and data_loss_issues for a file after bulk-insert.
   * Always called by the upload handler after Phase 2, regardless of whether
   * there are data loss issues. Transitions the file out of LOADING state.
   */
  updateFileStatus(
    fileSystemId: number,
    openStatus: FileOpenStatus,
    dataLossIssues: ValidationIssue[],
  ): Promise<void>;

  deleteProject(systemId: number): Promise<void>;

  /**
   * Update ACDB header metadata for a file after parsing.
   * Called by the upload handler after successfully parsing the ACDB header.
   */
  updateFileHeader(
    fileSystemId: number,
    headerData: FileHeaderData,
  ): Promise<void>;

  /**
   * Store opaque ui-metadata extras (switches JSON and srsMetadata JSON) on the file record.
   * Called at the end of upload after all entity insertions have completed.
   */
  updateFileUiMetadataExtras(
    fileSystemId: number,
    uiSwitchesJson: string | undefined,
    uiSrsMetadataJson: string | undefined,
  ): Promise<void>;

  /**
   * Returns the port strategy for the given file, or null when no
   * configuration row exists. Callers in the core layer apply the
   * INPUT_EVEN_OUTPUT_ODD default so the absence of configuration is
   * visible at the domain boundary rather than silently masked in infra.
   */
  getPortStrategy(fileSystemId: number): Promise<ModulePortStrategy | null>;
}
