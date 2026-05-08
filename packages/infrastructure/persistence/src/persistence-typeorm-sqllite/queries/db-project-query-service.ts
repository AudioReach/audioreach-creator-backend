/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ProjectQueryService} from '@arc/core';
import {DataSource} from 'typeorm';
import type {ProjectRow} from '../entity-schema/index.js';

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
}
