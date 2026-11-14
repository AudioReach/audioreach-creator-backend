/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {DbSubgraphQueryService} from './db-subgraph-query-service.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {VcpmCkvFetcher} from '../../fetchers/vcpm-ckv-fetcher.js';
import {VcpmInstanceFetcher} from '../../fetchers/vcpm-instance-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';
import {VcpmModuleParameterDefinitionFetcher} from '../../fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import {DbKeyValueDefQueryService} from '../key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

/**
 * Builds a DbSubgraphQueryService with all its dependencies on one
 * EntityManager. The shared query services pass the DataSource manager;
 * TypeOrmSubgraphRepository passes the unit-of-work manager, so commands
 * see their own uncommitted writes.
 */
export function createSubgraphQueryService(
  manager: EntityManager,
): DbSubgraphQueryService {
  const editActions = new EditActionsQueryService(manager);
  return new DbSubgraphQueryService(
    manager,
    new DbKeyValueDefQueryService(manager, editActions),
    new SubgraphOverlayFetcher(
      manager,
      editActions,
      new SubgraphPropertyDataFetcher(manager, editActions),
      new SubgraphSgkvFetcher(manager, editActions),
    ),
    editActions,
    new VcpmCkvFetcher(manager, new VcpmInstanceFetcher(manager)),
    new VcpmParameterPayloadFetcher(manager),
    new VcpmModuleParameterDefinitionFetcher(manager),
  );
}
