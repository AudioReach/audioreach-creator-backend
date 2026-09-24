/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import type {SubgraphPeerLinkFilter} from '../../../ports/persistence/query-services/shared/subgraph-peer-link-filter.js';

export class GetSubgraphPeerDataLinksQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly filter: SubgraphPeerLinkFilter,
  ) {
    super(clientId);
  }
}
