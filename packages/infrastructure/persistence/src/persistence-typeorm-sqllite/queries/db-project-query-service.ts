/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type ProjectQueryService,
  type ProjectSummary,
  ResourceNotFoundException,
  SESSION_MODE,
} from '@arc/core';
import {DataSource} from 'typeorm';
import type {ProjectRow} from '../entity-schema/index.js';
import {DbFileQuery} from './db-file-query.js';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {SESSION_STATUS} from '../entity-schema/edit-session/project-session.schema.js';

/**
 * Database implementation of ProjectQueryService
 * Handles querying project-related data from the database
 */
export class DbProjectQueryService implements ProjectQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getFileIdByProjectId(projectId: number): Promise<number> {
    const project = (await this.dataSource
      .getRepository(ENTITY_NAMES.Project)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :projectId', {projectId})
      .getOne()) as ProjectRow | null;

    if (!project?.files || project.files.length === 0) {
      throw new ResourceNotFoundException(
        `Project with ID ${projectId} not found or has no associated files`,
      );
    }

    return project.files[0].systemId;
  }

  async getFileNamesByProjectId(
    projectId: number,
  ): Promise<{acdb: string; awsp: string}> {
    const project = (await this.dataSource
      .getRepository(ENTITY_NAMES.Project)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :projectId', {projectId})
      .getOne()) as ProjectRow | null;

    if (!project?.files || project.files.length === 0) {
      throw new ResourceNotFoundException(
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

  async getAllProjectsWithSessionMode(): Promise<ProjectSummary[]> {
    const rows: Array<{
      systemId: number;
      name: string;
      description: string;
      type: string;
      sessionMode: string | null;
    }> = await this.dataSource
      .getRepository(ENTITY_NAMES.Project)
      .createQueryBuilder('p')
      .leftJoin('p.files', 'f')
      .leftJoin(
        ENTITY_NAMES.ProjectSession,
        'ps',
        'ps.fileSystemId = f.systemId AND ps.status = :activeStatus',
        {activeStatus: SESSION_STATUS.Active},
      )
      .select([
        'p.systemId AS systemId',
        'p.name AS name',
        'p.description AS description',
        'p.type AS type',
        'MAX(ps.session_mode) AS sessionMode',
      ])
      .groupBy('p.systemId')
      .addGroupBy('p.name')
      .addGroupBy('p.description')
      .addGroupBy('p.type')
      .orderBy('p.systemId', 'ASC')
      .getRawMany();

    return rows.map(r => ({
      systemId: r.systemId,
      name: r.name,
      description: r.description,
      type: r.type,
      sessionMode:
        (r.sessionMode as ProjectSummary['sessionMode']) ??
        SESSION_MODE.ReadOnly,
    }));
  }

  async getProjectWithSessionMode(
    projectId: number,
  ): Promise<ProjectSummary | null> {
    const row:
      | {
          systemId: number;
          name: string;
          description: string;
          type: string;
          sessionMode: string | null;
        }
      | undefined = await this.dataSource
      .getRepository(ENTITY_NAMES.Project)
      .createQueryBuilder('p')
      .leftJoin('p.files', 'f')
      .leftJoin(
        ENTITY_NAMES.ProjectSession,
        'ps',
        'ps.fileSystemId = f.systemId AND ps.status = :activeStatus',
        {activeStatus: SESSION_STATUS.Active},
      )
      .select([
        'p.systemId AS systemId',
        'p.name AS name',
        'p.description AS description',
        'p.type AS type',
        'MAX(ps.session_mode) AS sessionMode',
      ])
      .where('p.systemId = :projectId', {projectId})
      .groupBy('p.systemId')
      .addGroupBy('p.name')
      .addGroupBy('p.description')
      .addGroupBy('p.type')
      .getRawOne();

    if (!row) return null;

    return {
      systemId: row.systemId,
      name: row.name,
      description: row.description,
      type: row.type,
      sessionMode:
        (row.sessionMode as ProjectSummary['sessionMode']) ??
        SESSION_MODE.ReadOnly,
    };
  }
}
