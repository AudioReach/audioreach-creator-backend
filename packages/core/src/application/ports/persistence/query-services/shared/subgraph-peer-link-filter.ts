/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Links attached to one port of a module. */
export interface ModulePortLinkFilter {
  readonly moduleSystemId: number;
  readonly portSystemId: number;
}

/** Links of a subgraph, optionally only those to one peer subgraph. */
export interface SubgraphLinkFilter {
  readonly subgraphSystemId: number;
  readonly subgraphPeerSystemId?: number;
}

/**
 * The filter `findSubgraphPeerLinks` accepts. Each set field narrows the
 * result; both filters above are instances of it.
 */
export interface SubgraphPeerLinkFilter {
  readonly subgraphSystemId?: number;
  readonly subgraphPeerSystemId?: number;
  readonly moduleSystemId?: number;
  readonly portSystemId?: number;
}
