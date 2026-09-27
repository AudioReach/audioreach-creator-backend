/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingSubgraph} from './routing-input.js';

/**
 * One outgoing adjacency entry used by Phase 2 path analysis. The source is the enclosing
 * `routableAdjacency` map key, so each entry stores only its destination and EC semantics.
 */
export interface DirectedEdge {
  readonly destSubgraphSystemId: number;
  readonly isEc: boolean;
}

/**
 * Immutable Phase 2 lookup view shared with MDF analysis and deletion reconstruction.
 * Full overlay support and request-scoped routable adjacency remain separate to prevent
 * request exclusions from creating false deletion impact.
 */
export interface TopologyImpactInventory {
  readonly committedUsecasesByDirectedPair: ReadonlyMap<
    string,
    readonly UseCase[]
  >;
  readonly committedUsecasesBySubgraph: ReadonlyMap<number, readonly UseCase[]>;
  readonly deletedDataLinks: readonly DataLink[];
  readonly deletedControlLinks: readonly ControlLink[];
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly survivingDataLinkPairKeys: ReadonlySet<string>;
  readonly survivingControlLinkPairKeys: ReadonlySet<string>;
  readonly routableAdjacency: ReadonlyMap<number, readonly DirectedEdge[]>;
  readonly routingSubgraphsById: ReadonlyMap<number, RoutingSubgraph>;
}
