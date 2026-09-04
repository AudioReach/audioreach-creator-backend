/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SessionMode} from '../../../../shared/change-vocabulary.js';
import type {ProjectBase} from '../../../../../domain/entities/usecase-data/project/project.js';

export interface ProjectReadModel extends ProjectBase {
  sessionMode: SessionMode;
}

/**
 * Query service interface for project queries
 */
export interface ProjectQueryService {
  /**
   * Get file ID associated with a project
   * @param projectId - The project system ID
   * @returns Promise resolving to the file system ID
   * @throws Error if project not found or has no associated file
   */
  getFileIdByProjectId(projectId: number): Promise<number>;

  /**
   * Get the original uploaded file names for a project.
   * Names are stored in arc_db_file.fileName as JSON: { acdb: "...", awsp: "..." }
   * @param projectId - The project system ID
   * @returns Promise resolving to { acdb: string, awsp: string }
   * @throws Error if project not found or has no associated file
   */
  getFileNamesByProjectId(
    projectId: number,
  ): Promise<{acdb: string; awsp: string}>;

  /**
   * Get ACDB project file properties for a project's file.
   * @param projectId - The project system ID
   * @returns Promise resolving to file properties data
   * @throws Error if project not found or has no associated file
   */
  getFileProperties(projectId: number): Promise<{
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
  }>;

  /**
   * Get all projects with their current session mode (READONLY if no active session).
   * Uses a single LEFT JOIN query to avoid N+1.
   */
  getAllProjects(): Promise<ProjectReadModel[]>;

  /**
   * Get a single project with its current session mode.
   * Returns null if the project does not exist.
   */
  getProject(projectId: number): Promise<ProjectReadModel | null>;
}
