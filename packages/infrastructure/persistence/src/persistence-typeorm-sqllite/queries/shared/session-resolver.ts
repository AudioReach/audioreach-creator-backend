/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SESSION_STATUS} from '../../entity-schema/edit-session/project-session.schema.js';

/**
 * Returns the active session ID for the given file, or null when no session
 * is active.
 *
 * project_sessions is not session-mutable — it IS the session context itself.
 * A session cannot be staged inside another session, so FR-3 does not apply
 * and a direct query is both correct and necessary.
 *
 * Shared across all query services that need a sessionId for fetcher calls.
 * Extracted here because every refactored service uses the same pattern —
 * keeping it in one place removes duplication and ensures the query is
 * consistent everywhere.
 */
export async function resolveActiveSessionId(
  dataSource: DataSource,
  fileSystemId: number,
): Promise<number | null> {
  const session = (await dataSource
    .getRepository(ENTITY_NAMES.ProjectSession)
    .createQueryBuilder('s')
    .select('s.sessionId')
    .where('s.fileSystemId = :fileSystemId', {fileSystemId})
    .andWhere('s.status = :status', {status: SESSION_STATUS.Active})
    .getOne()) as {sessionId: number} | null;
  return session?.sessionId ?? null;
}
