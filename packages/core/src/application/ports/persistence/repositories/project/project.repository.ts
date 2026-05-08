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
import type {OperationResult} from '../../../../../shared/types/operation-result.js';

export interface ProjectCreationResult {
  project: Project;
  file: ArcDbFile;
}

export interface ProjectRepository {
  /**
   * Insert a new offline project and its initial file in a single operation.
   * Both rows are covered by the caller's active transaction.
   * Returns failResult (never throws) so the caller can manage rollback explicitly.
   */
  createOfflineProject(
    projectName: string,
    projectDescription: string,
    file: Omit<ArcDbFileInit, 'systemId'>,
  ): Promise<OperationResult<ProjectCreationResult>>;

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
}
