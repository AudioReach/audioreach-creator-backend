/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SessionMode, Source} from '../../../../shared/change-vocabulary.js';

/**
 * Read-side snapshot of a project session row.
 * Returned by session-lookup methods and used by SessionGuard to construct ActiveSession.
 */
export type ProjectSession = {
  /** DB primary key of the session row in `project_sessions`. */
  sessionId: number;
  /** Operating mode declared when the session was started. */
  mode: SessionMode;
  /** FK to `arc_db_files.system_id`. */
  fileSystemId: number;
  /** UUID of the owning project — carried for guard/error context. */
  projectId: string;
};

/**
 * Port interface for session lifecycle and lookup operations.
 *
 * Defined in @arc/core (not @arc/persistence) so that SessionGuard (@arc/api)
 * and session lifecycle handlers (@arc/core) can depend on it without importing
 * from the infrastructure layer.
 *
 * Implemented by TypeOrmSessionRepository in @arc/persistence.
 */
export interface ISessionRepository {
  /**
   * Composite lookup used by SessionGuard: resolves projectId → fileSystemId →
   * active session in a single adapter call (one SQL round-trip with a JOIN).
   * Returns null when the project has no active session.
   */
  findActiveSessionByProjectId(
    projectId: string,
  ): Promise<ProjectSession | null>;

  /**
   * Resolves a project UUID to the numeric file-system ID.
   * Returns null when the project does not exist in the DB.
   */
  findFileSystemIdByProjectId(projectId: string): Promise<number | null>;

  /**
   * Looks up the active session for a file-system ID directly.
   * Returns null when no ACTIVE session exists for the file.
   */
  findActiveSessionByFileSystemId(
    fileSystemId: number,
  ): Promise<ProjectSession | null>;

  /**
   * Inserts a new session row with status ACTIVE.
   * Returns the generated sessionId (DB primary key).
   */
  createSession(row: {
    fileSystemId: number;
    sessionMode: SessionMode;
    userId: string | null;
  }): Promise<number>;

  /**
   * Returns the number of commit rows recorded for the session.
   */
  countCommitsForSession(sessionId: number): Promise<number>;

  /**
   * Hard-deletes the session row. Cascades to edit_actions and
   * session_entity_versions via FK ON DELETE CASCADE.
   * Call when there are no commits for the session
   */
  deleteSession(sessionId: number): Promise<void>;

  /**
   * Transitions session status from ACTIVE to ENDED and records endedAt = NOW.
   */
  markSessionEnded(sessionId: number): Promise<void>;

  /**
   * Deletes all UNSTAGED edit_actions rows for the session where validUntil IS NULL
   * (i.e. the current/active rows only — historical superseded rows are retained).
   * Returns the number of rows deleted.
   */
  wipeUnstagedForSession(sessionId: number): Promise<number>;

  /**
   * Deletes every edit action for the session from one source, including
   * superseded rows and all operations/tables. Returns the number of rows.
   */
  deleteEditActionsBySource(sessionId: number, source: Source): Promise<number>;

  /**
   * Counts active (validUntil IS NULL) STAGED edit_actions rows for the session.
   * Used by EndSessionHandler to guard against ending a session with uncommitted staged changes.
   */
  countStagedChangesForSession(sessionId: number): Promise<number>;
}
