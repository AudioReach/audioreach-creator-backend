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
}
