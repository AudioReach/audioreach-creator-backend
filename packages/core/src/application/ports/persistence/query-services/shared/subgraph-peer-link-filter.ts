/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ModulePortLinkFilter {
  readonly moduleSystemId: number;
  readonly portSystemId: number;
}

export interface SubgraphLinkFilter {
  readonly subgraphSystemId: number;
  readonly subgraphPeerSystemId?: number;
}

/** Compatibility filter used by the existing shared persistence implementation. */
export interface SubgraphPeerLinkFilter {
  readonly subgraphSystemId?: number;
  readonly subgraphPeerSystemId?: number;
  readonly moduleSystemId?: number;
  readonly portSystemId?: number;
}
