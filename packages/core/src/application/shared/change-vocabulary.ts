/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const CHANGE_OPERATION = {
  None: 'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;

export type ChangeOperation =
  (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION];

/**
 * Status stamped on ONE pending-change row at write time.
 * Used at the storage layer: edit_actions.change_status column, stage/unstage
 * operations, and the commit filter (WHERE change_status = 'STAGED').
 */
export const CHANGE_STATUS = {
  Staged: 'STAGED',
  Unstaged: 'UNSTAGED',
} as const;

export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];

/**
 * Aggregate status computed at READ TIME across all active pending rows for
 * one entity. Surfaced on entity DTOs as `pendingChangeStatus` (absent when
 * the entity has no pending changes). PARTIAL means the entity has a mix of
 * STAGED and UNSTAGED rows — possible in DIFF_MERGE when the user has
 * selected some but not all proposed changes for an entity.
 *
 * Different from ChangeStatus: a single row is always STAGED or UNSTAGED;
 * PARTIAL can only arise from aggregating across multiple rows.
 */
export const PENDING_CHANGE_STATUS = {
  Staged: 'STAGED',
  Unstaged: 'UNSTAGED',
  Partial: 'PARTIAL',
} as const;

export type PendingChangeStatus =
  (typeof PENDING_CHANGE_STATUS)[keyof typeof PENDING_CHANGE_STATUS];

export interface ChangeInfo {
  changeType: ChangeOperation;
  changeId?: number; // EditActionRow.changeId — present when changeType != NONE
  changeStatus?: ChangeStatus;
}

/**
 * The origin of a pending change row — determines changeStatus at write time
 * (§9.6 of foundation.md) and enables source-filtered queries (§11.1).
 * Values mirror the `source` simple-enum column on `edit_actions`.
 */
export const SOURCE = {
  Manual: 'MANUAL',
  DiffTool: 'DIFF_TOOL',
  AutoRouting: 'AUTO_ROUTING',
} as const;

export type Source = (typeof SOURCE)[keyof typeof SOURCE];

/**
 * Session operating mode. Defined here (not in @arc/persistence) so that
 * @arc/core types (ActiveSession, commands) can reference it without importing
 * from the infrastructure layer. Values must match SESSION_MODE in
 * project-session.schema.ts — any divergence is a build-time type error at
 * the persistence adapter boundary.
 */
export const SESSION_MODE = {
  Designer: 'DESIGNER',
  Tuning: 'TUNING',
  DiffMerge: 'DIFF_MERGE',
  DiscoveryWizard: 'DISCOVERY_WIZARD',
} as const;

export type SessionMode = (typeof SESSION_MODE)[keyof typeof SESSION_MODE];
