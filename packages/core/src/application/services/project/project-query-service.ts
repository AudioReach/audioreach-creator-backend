/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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
   * Get ACDB header information for a project's file.
   * @param projectId - The project system ID
   * @returns Promise resolving to header data
   * @throws Error if project not found or has no associated file
   */
  getFileHeaderInfo(projectId: number): Promise<{
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
}
