/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ProjectSessionRow} from '../../entity-schema/index.js';
// eslint-disable-next-line sonarjs/deprecation
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {EntityName} from '../../entity-schema/entity-table-names.js';

/**
 * Applies edit-session overlay to a flat list of link rows, deduplicates
 * by systemId, and maps each surviving row to a read model.
 *
 * Shared by DbDataLinkQueryService and DbControlLinkQueryService to avoid
 * duplicating the overlay + dedup + map pattern in both services.
 *
 * @param links       baseline link rows from DB
 * @param entityName  ENTITY_NAMES constant for the link type (DataLink or ControlLink)
 * @param session     active session resolved by the caller — avoids a second findActiveSession call
 * @param editActionsQuerySvc
 * @param mapper      row → read model
 */
export async function applyLinkOverlayAndMap<
  TRow extends {systemId: number},
  TModel,
>(
  links: TRow[],
  entityName: EntityName,
  session: ProjectSessionRow | null,
  editActionsQuerySvc: EditActionsQueryService,
  mapper: (row: TRow) => TModel,
): Promise<TModel[]> {
  let overlaid = links;

  if (session) {
    const actions = await editActionsQuerySvc.getByTable(
      session.sessionId,
      entityName,
    );
    if (actions.length > 0) {
      // eslint-disable-next-line sonarjs/deprecation
      overlaid = applyToCollection(
        overlaid as unknown as Array<{systemId: number}>,
        actions,
      ) as unknown as TRow[];
    }
  }

  return deduplicateAndMap(overlaid, mapper);
}

/**
 * Deduplicates an array of entities by systemId and maps each to a read model.
 * Reusable across query services that produce flat entity lists.
 */
export function deduplicateAndMap<T extends {systemId: number}, R>(
  items: T[],
  mapper: (item: T) => R,
): R[] {
  const seen = new Set<number>();
  return items
    .filter(item => !seen.has(item.systemId) && seen.add(item.systemId))
    .map(item => mapper(item));
}
