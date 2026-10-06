/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {
  ManualTopology,
  RoutingSubgraph,
} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {DirectedCycleDetector} from '../shared/directed-cycle-detector.js';
import {ManualCandidateRelationshipBuilder} from './manual-candidate-relationship-builder.js';
import {ManualLinkSupportResolver} from './manual-link-support-resolver.js';

export interface ManualTopologyDiscoveryInput {
  readonly selectedUsecases: readonly UseCase[];
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly dataLinks: readonly DataLink[];
  readonly overlayDataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

/**
 * Contract seam for the manual pair-discovery implementation.
 *
 * Used by `CreateManualUsecasesHandler`.
 */
export class ManualPairDiscoveryService {
  constructor(
    private readonly candidateRelationshipBuilder = new ManualCandidateRelationshipBuilder(),
    private readonly linkSupportResolver = new ManualLinkSupportResolver(),
    private readonly cycleDetector = new DirectedCycleDetector(),
  ) {}

  discover(input: ManualTopologyDiscoveryInput): Result<ManualTopology> {
    const candidates = this.candidateRelationshipBuilder.build({
      selectedUsecases: input.selectedUsecases,
      subgraphSystemIds: input.subgraphs.map(
        routingSubgraph => routingSubgraph.subgraph.systemId,
      ),
    });
    const pairs = this.linkSupportResolver.resolve({
      candidates,
      dataLinks: input.dataLinks,
      overlayDataLinks: input.overlayDataLinks,
      controlLinks: input.controlLinks,
    });
    const cycle = this.cycleDetector.findCycle(pairs);
    if (cycle !== null) {
      return Result.fail(RoutingIssueFactory.manualCycleDetected(cycle));
    }
    return Result.ok({pairs});
  }
}
