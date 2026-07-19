/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SessionMode} from '../../shared/change-vocabulary.js';

/**
 * Call-boundary snapshot of the active session for a project.
 * Populated by SessionGuard (@arc/api) and passed to CommandBus.execute().
 * Held on WriteContext for the duration of the command handler.
 * Pure TypeScript — no NestJS or TypeORM imports (§8.1 of foundation.md).
 */
export type ActiveSession = {
  /** DB primary key of the session row in `project_sessions`. */
  sessionId: number;
  /** Operating mode — controls which commands are permitted and how
   *  pending-change rows are stamped (changeStatus determination §9.6). */
  mode: SessionMode;
  /** FK to `arc_db_files.system_id` — the open workspace file. */
  fileSystemId: number;
  /** UUID of the project — carried for audit / error context only.
   *  Not used for DB queries inside handlers (use sessionId / fileSystemId). */
  projectId: string;
};
