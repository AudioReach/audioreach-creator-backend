/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ArcDbFile, Project, type ProjectType} from '@arc/core';

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

  // Delete operations
  deleteProject(systemId: number): Promise<void>; // Cascade deletes files
}
