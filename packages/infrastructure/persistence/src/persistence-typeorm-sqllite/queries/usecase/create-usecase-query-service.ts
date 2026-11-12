/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {DbUseCaseQueryService} from './db-usecase-query-service.js';
import {UseCaseCategoryFetcher} from '../../fetchers/usecase-category-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../../fetchers/usecase-gkv-values-fetcher.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {DbKeyValueDefQueryService} from '../key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

/**
 * Builds a DbUseCaseQueryService with all its dependencies on one
 * EntityManager. The shared query services pass the DataSource manager;
 * TypeOrmUsecaseRepository passes the unit-of-work manager, so commands
 * see their own uncommitted writes.
 */
export function createUseCaseQueryService(
  manager: EntityManager,
): DbUseCaseQueryService {
  const editActions = new EditActionsQueryService(manager);
  return new DbUseCaseQueryService(
    manager,
    new DbKeyValueDefQueryService(manager, editActions),
    editActions,
    new UsecaseOverlayFetcher(
      manager,
      editActions,
      new UseCaseCategoryFetcher(manager, editActions),
      new UsecaseGkvValuesFetcher(manager, editActions),
    ),
    new LinkOverlayFetcher(manager, editActions),
    new SubsystemOverlayFetcher(manager, editActions),
    new SubgraphOverlayFetcher(
      manager,
      editActions,
      new SubgraphPropertyDataFetcher(manager, editActions),
      new SubgraphSgkvFetcher(manager, editActions),
    ),
  );
}
