/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ArcDbFile, Project, type ProjectType} from '@arc/core';
import type {FileOpenStatus} from '../../../../../domain/entities/usecase-data/project/arc-db-file.js';
import type {ValidationIssue} from '../../../../../domain/validation/issue.js';

export interface ProjectRepository {
  // Create offline project with initial file (for upload-file workflow)
  createOfflineProject(
    project: Omit<Project, 'systemId' | 'type'>, // type is implicit (OFFLINE)
    file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  ): Promise<{project: Project; file: ArcDbFile}>;

  // Create connected project (for future use)
  createConnectedProject(
    project: Omit<Project, 'systemId' | 'type'>,
  ): Promise<Project>;

  // Add file to existing project
  addFile(
    projectSystemId: number,
    file: Omit<ArcDbFile, 'systemId' | 'projectSystemId'>,
  ): Promise<ArcDbFile>;

  // Read operations
  findProjectById(systemId: number): Promise<Project | null>;
  findProjectByName(name: string): Promise<Project | null>;
  listAllProjects(): Promise<Project[]>;
  listProjectsByType(type: ProjectType): Promise<Project[]>;

  // Update operations (only project name/description, files are immutable)
  updateProject(
    systemId: number,
    updates: Partial<Pick<Project, 'name' | 'description'>>,
  ): Promise<void>;

  /**
   * Persist the open_status and data_loss_issues for a file after bulk-insert.
   * Called once by the upload handler after collecting all insertion failures.
   * Pass an empty array to clear DATA_LOSS issues (used by AcknowledgeDataLossCommand).
   */
  updateFileStatus(
    fileSystemId: number,
    openStatus: FileOpenStatus,
    dataLossIssues: ValidationIssue[],
  ): Promise<void>;

  // Delete operations
  deleteProject(systemId: number): Promise<void>; // Cascade deletes files
}
