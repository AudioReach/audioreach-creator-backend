/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ProjectQueryService} from '@arc/core';
import {DataSource} from 'typeorm';
import type {ProjectRow} from '../entity-schema/index.js';
import {DbFileQuery} from './db-file-query.js';

/**
 * Database implementation of ProjectQueryService
 * Handles querying project-related data from the database
 */
export class DbProjectQueryService implements ProjectQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getFileIdByProjectId(projectId: number): Promise<number> {
    const project = (await this.dataSource
      .getRepository('Project')
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :projectId', {projectId})
      .getOne()) as ProjectRow | null;

    if (!project?.files || project.files.length === 0) {
      throw new Error(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    return project.files[0].systemId;
  }

  async getFileNamesByProjectId(
    projectId: number,
  ): Promise<{acdb: string; awsp: string}> {
    const project = (await this.dataSource
      .getRepository('Project')
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :projectId', {projectId})
      .getOne()) as ProjectRow | null;

    if (!project?.files || project.files.length === 0) {
      throw new Error(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    const file = project.files[0];
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
}
