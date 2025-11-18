import type {ProjectQueryService} from '@arc/core';
import {DataSource} from 'typeorm';

/**
 * Database implementation of ProjectQueryService
 * Handles querying project-related data from the database
 */
export class DbProjectQueryService implements ProjectQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getFileIdByProjectId(projectId: number): Promise<number> {
    const project = await this.dataSource
      .getRepository('Project')
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :projectId', {projectId})
      .getOne();

    if (!project?.files || project.files.length === 0) {
      throw new Error(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    return project.files[0].systemId;
  }
}
