/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ISessionRepository,
  ProjectSession,
  SessionMode,
  Source,
} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {
  SESSION_STATUS,
  ProjectSessionSchema,
} from '../../entity-schema/edit-session/project-session.schema.js';
import {SessionCommitSchema} from '../../entity-schema/edit-session/session-commit.schema.js';
import {ArcDbFileSchema} from '../../entity-schema/project-data/arc-db-file.schema.js';
import {EditActionSchema} from '../../entity-schema/edit-session/edit-action.schema.js';
import {CHANGE_STATUS} from '@arc/core';

/**
 * TypeORM adapter for ISessionRepository (spec §7b.3).
 *
 * Accepts an EntityManager so it works in both contexts:
 *   - SessionGuard: pass dataSource.manager (no transaction)
 *   - Handlers:     pass queryRunner.manager (inside the handler's transaction)
 *
 * Consistent with the project's established pattern
 * (TypeOrmBulkImportRepository, TypeOrmProjectRepository all take EntityManager).
 */
export class TypeOrmSessionRepository implements ISessionRepository {
  constructor(private readonly manager: EntityManager) {}

  async findActiveSessionByProjectId(
    projectId: string,
  ): Promise<ProjectSession | null> {
    const numericId = Number(projectId);
    if (Number.isNaN(numericId)) return null;
    // Navigates ProjectSession → file (ArcDbFile) → project (Project) via named relations.
    const row = await this.manager
      .createQueryBuilder(ProjectSessionSchema, 'ps')
      .innerJoin('ps.file', 'f')
      .innerJoin('f.project', 'p')
      .select(['ps.sessionId', 'ps.sessionMode', 'ps.fileSystemId'])
      .where('p.systemId = :projectId', {projectId: numericId})
      .andWhere('ps.status = :status', {status: SESSION_STATUS.Active})
      .getOne();

    if (!row) return null;
    return {
      sessionId: row.sessionId,
      mode: row.sessionMode as ProjectSession['mode'],
      fileSystemId: row.fileSystemId,
      projectId,
    };
  }

  async findFileSystemIdByProjectId(projectId: string): Promise<number | null> {
    const row = await this.manager
      .createQueryBuilder(ArcDbFileSchema, 'f')
      .innerJoin('f.project', 'p')
      .select('f.systemId')
      .where('p.systemId = :projectId', {projectId: Number(projectId)})
      .getOne();

    return row?.systemId ?? null;
  }

  async findActiveSessionByFileSystemId(
    fileSystemId: number,
  ): Promise<ProjectSession | null> {
    const dbRow = await this.manager
      .createQueryBuilder(ProjectSessionSchema, 'ps')
      .innerJoin('ps.file', 'f')
      .innerJoin('f.project', 'p')
      .select('ps.sessionId', 'sessionId')
      .addSelect('ps.sessionMode', 'sessionMode')
      .addSelect('ps.fileSystemId', 'fileSystemId')
      .addSelect('p.systemId', 'projectSystemId')
      .where('ps.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('ps.status = :status', {status: SESSION_STATUS.Active})
      .getRawOne<{
        sessionId: number;
        sessionMode: string;
        fileSystemId: number;
        projectSystemId: number;
      }>();

    if (!dbRow) return null;
    return {
      sessionId: dbRow.sessionId,
      mode: dbRow.sessionMode as ProjectSession['mode'],
      fileSystemId: dbRow.fileSystemId,
      projectId: String(dbRow.projectSystemId),
    };
  }

  async createSession(row: {
    fileSystemId: number;
    sessionMode: SessionMode;
    userId: string | null;
  }): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(ProjectSessionSchema)
      .values({
        fileSystemId: row.fileSystemId,
        sessionMode: row.sessionMode,
        userId: row.userId,
        status: SESSION_STATUS.Active,
      })
      .execute();

    return result.identifiers[0].sessionId as number;
  }

  async wipeUnstagedForSession(sessionId: number): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .delete()
      .from(EditActionSchema)
      .where('sessionId = :sessionId', {sessionId})
      .andWhere('changeStatus = :status', {status: CHANGE_STATUS.Unstaged})
      .andWhere('validUntil IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  async deleteEditActionsBySource(
    sessionId: number,
    source: Source,
  ): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .delete()
      .from(EditActionSchema)
      .where('sessionId = :sessionId', {sessionId})
      .andWhere('source = :source', {source})
      .execute();
    return result.affected ?? 0;
  }

  async countStagedChangesForSession(sessionId: number): Promise<number> {
    const result = await this.manager
      .createQueryBuilder(EditActionSchema, 'ea')
      .select('COUNT(*)', 'count')
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.changeStatus = :status', {status: CHANGE_STATUS.Staged})
      .andWhere('ea.validUntil IS NULL')
      .getRawOne<{count: string}>();
    return Number(result?.count ?? 0);
  }

  async countCommitsForSession(sessionId: number): Promise<number> {
    const result = await this.manager
      .createQueryBuilder(SessionCommitSchema, 'sc')
      .select('COUNT(*)', 'count')
      .where('sc.sessionId = :sessionId', {sessionId})
      .getRawOne<{count: string}>();
    return Number(result?.count ?? 0);
  }

  async deleteSession(sessionId: number): Promise<void> {
    await this.manager
      .createQueryBuilder()
      .delete()
      .from(ProjectSessionSchema)
      .where('sessionId = :sessionId', {sessionId})
      .execute();
  }

  async markSessionEnded(sessionId: number): Promise<void> {
    await this.manager
      .createQueryBuilder()
      .update(ProjectSessionSchema)
      .set({
        status: SESSION_STATUS.Ended,
        endedAt: () => "datetime('now')",
      })
      .where('sessionId = :sessionId', {sessionId})
      .execute();
  }
}
