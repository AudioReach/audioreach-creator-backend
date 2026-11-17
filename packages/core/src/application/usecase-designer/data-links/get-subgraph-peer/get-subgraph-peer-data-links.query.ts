/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import type {SubgraphPeerLinkFilter} from '../../../ports/persistence/query-services/shared/subgraph-peer-link-filter.js';

/**
 * Unused: no controller dispatches this query. It is left over from the
 * combined link endpoint that was split into the module-port and
 * subgraph-links endpoints.
 *
 * TODO: remove this query, its handler, spec and registry entry; see
 * `subgraph-peer-link-filter.ts`.
 */
export class GetSubgraphPeerDataLinksQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly filter: SubgraphPeerLinkFilter,
  ) {
    super(clientId);
  }
}
