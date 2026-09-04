/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type ProjectQueryService,
  type ProjectReadModel,
  type ProjectType,
  ResourceNotFoundException,
} from '@arc/core';
import {DataSource} from 'typeorm';
import {DbFileQuery} from './db-file-query.js';
import {ProjectFetcher} from '../fetchers/project-fetcher.js';

export class DbProjectQueryService implements ProjectQueryService {
  private readonly fetcher: ProjectFetcher;

  constructor(private readonly dataSource: DataSource) {
    this.fetcher = new ProjectFetcher(dataSource.manager);
  }

  async getFileIdByProjectId(projectId: number): Promise<number> {
    const row = await this.fetcher.fetchOneWithFile(projectId);

    if (!row?.files || row.files.length === 0) {
      throw new ResourceNotFoundException(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    return row.files[0].systemId;
  }

  async getFileNamesByProjectId(
    projectId: number,
  ): Promise<{acdb: string; awsp: string}> {
    const row = await this.fetcher.fetchOneWithFile(projectId);

    if (!row?.files || row.files.length === 0) {
      throw new ResourceNotFoundException(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    const file = row.files[0];
    // fileName is stored as JSON: { acdb: "...", awsp: "...", uploadedAt: "..." }
    const parsed = JSON.parse(file.fileName) as {
      acdb: string;
      awsp: string;
    };

    return {acdb: parsed.acdb, awsp: parsed.awsp};
  }

  async getFileProperties(projectId: number): Promise<{
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
  }> {
    // Get fileSystemId from projectId
    const fileSystemId = await this.getFileIdByProjectId(projectId);

    // Use shared DbFileQuery to get file properties metadata
    const fileQuery = new DbFileQuery(this.dataSource);
    const metadata = await fileQuery.readFileProperties(fileSystemId);

    // Transform ProjectHeaderMetadata to expected format
    return {
      headerVersion: 1, // Default value, can be added to ProjectHeaderMetadata if needed
      acdbVersion: {
        major: metadata.version.major,
        minor: metadata.version.minor,
        revision: metadata.version.revision,
        cplInfo: metadata.version.cplInfo,
      },
      codecInfos: JSON.stringify(metadata.codecInfos),
      modifiedDate: metadata.modifiedDate,
      oemInfo: metadata.oemInfo,
    };
  }

  async getAllProjects(): Promise<ProjectReadModel[]> {
    const rows = await this.fetcher.fetchMany();
    return rows.map(r => ({
      systemId: r.systemId,
      name: r.name,
      description: r.description,
      type: r.type as ProjectType,
      sessionMode: r.sessionMode as ProjectReadModel['sessionMode'],
    }));
  }

  async getProject(projectId: number): Promise<ProjectReadModel | null> {
    const row = await this.fetcher.fetchOne(projectId);
    if (!row) return null;
    return {
      systemId: row.systemId,
      name: row.name,
      description: row.description,
      type: row.type as ProjectType,
      sessionMode: row.sessionMode as ProjectReadModel['sessionMode'],
    };
  }
}
