/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import type {RoutingInput} from './routing-input.js';
import type {RoutingOutcome} from './routing-outcome.js';
import type {
  ClassifiedUsecase,
  DfsPath,
  UsecaseChangeDescriptor,
  KvResolution,
  OrphanCandidate,
  DeletionAnalysis,
  IslandTransition,
  RoutingCombination,
  RoutingCandidates,
  RoutingCone,
  RoutingSeed,
} from './routing-state.js';

export class RoutingContext {
  /** Immutable, handler-normalized input shared by every phase in one routing run. */
  readonly input: RoutingInput;
  /** Grouped Phase 2 deletion analysis. */
  deletionAnalysis: DeletionAnalysis | null = null;
  /** Complete Phase 3 island-transition descriptors. */
  readonly islandTransitions: IslandTransition[] = [];
  /** Phase 4 resolved SGKV selections used by later routing phases. */
  readonly kvResolutions: KvResolution[] = [];
  /** Phase 5 routing starting points identified from graph edits. */
  readonly seeds: RoutingSeed[] = [];
  /** Phase 6 subgraph regions computed around the routing seeds. */
  readonly cones: RoutingCone[] = [];
  /** Phase 7 DFS paths. */
  readonly dfsPaths: DfsPath[] = [];
  /** Phase 8 UC candidates grouped with EC bridge candidates. */
  readonly routingCandidates: RoutingCandidates & {
    readonly combinations: RoutingCombination[];
    readonly ecBridgeCandidates: RoutingCombination[];
  } = {
    combinations: [],
    ecBridgeCandidates: [],
  };
  /** Phase 9 decisions for candidate UCs after GKV/topology matching and lifecycle checks. */
  readonly classifiedUcs: ClassifiedUsecase[] = [];
  /** Phase 10 orphan candidates found by effective-graph validation. */
  readonly orphanCandidates: OrphanCandidate[] = [];
  /** Non-blocking issues accumulated by phases; warnings do not stop the engine. */
  readonly warnings: Issue[] = [];
  /** Phase 11 canonical UC change descriptors returned in the routing outcome. */
  readonly emittedUcChanges: UsecaseChangeDescriptor[] = [];
  /** Phase 12 core result; this is not an HTTP response. */
  routingOutcome: RoutingOutcome | null = null;

  constructor(input: RoutingInput) {
    this.input = input;
  }
}
