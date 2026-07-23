/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {OverlayMergeImpl} from './overlay-merge.js';

const overlay = new OverlayMergeImpl();

/**
 * Applies overlay to a single base row using pre-fetched EditActionRow[],
 * filtered by tableName before delegating to applyToCollection.
 *
 * Why this exists: getByAggregateId returns actions for all tables
 * under one aggregate in a single DB call. This function filters to the relevant
 * table, eliminating the repeated filter → null-guard → applyToCollection → [0]
 * pattern that would otherwise be duplicated across every service
 * (KeyValueDefQueryService, ParameterPayloadQueryService, etc.).
 *
 * Accepts null baseRow — a CREATE action in the session can produce the row even
 * when it does not yet exist in the DB.
 * Returns null if the row is deleted or absent from both DB and session.
 */
export function applyTableOverlay<T extends {systemId: number}>(
  baseRow: T | null,
  actions: EditActionRow[],
  tableName: string,
): T | null {
  const tableActions = actions.filter(a => a.targetTable === tableName);
  const baseRows = baseRow ? [baseRow] : [];
  return (
    overlay.applyToCollection<T>(baseRows, tableActions)[0]?.effective ?? null
  );
}
