/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {DbDataLinkQueryService} from './db-data-link-query-service.js';
import {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {UseCaseCategoryFetcher} from '../../fetchers/usecase-category-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../../fetchers/usecase-gkv-values-fetcher.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';

/**
 * Builds a DbDataLinkQueryService with all its dependencies on one
 * EntityManager. The shared query services pass the DataSource manager;
 * TypeOrmDataLinkRepository passes the unit-of-work manager, so commands
 * see their own uncommitted writes.
 */
export function createDataLinkQueryService(
  manager: EntityManager,
): DbDataLinkQueryService {
  const editActions = new EditActionsQueryService(manager);
  return new DbDataLinkQueryService(
    manager,
    editActions,
    new UsecaseOverlayFetcher(
      manager,
      editActions,
      new UseCaseCategoryFetcher(manager, editActions),
      new UsecaseGkvValuesFetcher(manager, editActions),
    ),
    new LinkOverlayFetcher(manager, editActions),
  );
}
