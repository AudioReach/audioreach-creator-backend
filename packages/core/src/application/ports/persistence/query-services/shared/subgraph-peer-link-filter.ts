/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Filters supported by subgraph-peer data-link and control-link queries. */
export interface SubgraphPeerLinkFilter {
  readonly subgraphSystemId?: number;
  readonly moduleSystemId?: number;
  readonly portSystemId?: number;
}
