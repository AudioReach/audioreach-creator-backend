/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SESSION_MODE} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {
  type ArcDbFileRow,
  type ProjectRow,
  ProjectSchema,
} from '../entity-schema/index.js';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {SESSION_STATUS} from '../entity-schema/edit-session/project-session.schema.js';

export interface ProjectBaseRow {
  systemId: number;
  name: string;
  description: string;
  type: string;
  sessionMode: string;
}

export interface ProjectWithFileRow {
  systemId: number;
  name: string;
  description: string;
  type: string;
  files: ArcDbFileRow[];
}

export class ProjectFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(): Promise<ProjectBaseRow[]> {
    const rows: Array<{
      systemId: number;
      name: string;
      description: string;
      type: string;
      sessionMode: string | null;
    }> = await this.manager
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
      sessionMode: r.sessionMode ?? SESSION_MODE.ReadOnly,
    }));
  }

  async fetchOne(systemId: number): Promise<ProjectBaseRow | null> {
    const row:
      | {
          systemId: number;
          name: string;
          description: string;
          type: string;
          sessionMode: string | null;
        }
      | undefined = await this.manager
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
      .where('p.systemId = :systemId', {systemId})
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
      sessionMode: row.sessionMode ?? SESSION_MODE.ReadOnly,
    };
  }

  async fetchOneWithFile(systemId: number): Promise<ProjectWithFileRow | null> {
    const row = (await this.manager
      .getRepository(ENTITY_NAMES.Project)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.files', 'f')
      .where('p.systemId = :systemId', {systemId})
      .getOne()) as ProjectRow | null;

    if (!row) return null;
    return {
      systemId: row.systemId,
      name: row.name,
      description: row.description,
      type: row.type,
      files: row.files ?? [],
    };
  }

  async exists(systemId: number): Promise<boolean> {
    const count = await this.manager.count(ProjectSchema, {where: {systemId}});
    return count > 0;
  }
}
