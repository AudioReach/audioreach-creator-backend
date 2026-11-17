/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Why these filters look like this: link reads began as one endpoint with
 * one combined filter (`SubgraphPeerLinkFilter`, read by
 * `findSubgraphPeerLinks`). That endpoint was later split into the
 * module-port and subgraph-links endpoints, which pass the two narrow
 * filters below, but the combined filter and read stayed underneath. As a
 * result the read name does not match the module-port case, and the
 * combined filter allows meaningless calls (module without port, no
 * fields at all).
 *
 * TODO: replace the read with `findByModulePort(fileSystemId,
 * moduleSystemId, portSystemId)` and `findBySubgraph(fileSystemId,
 * subgraphSystemId, peerSubgraphSystemId?)`, delete these three filters,
 * and remove the unused `GetSubgraphPeer{Data,Control}LinksQuery`
 * queries and handlers left over from the combined endpoint.
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
