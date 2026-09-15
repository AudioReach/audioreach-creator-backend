/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {RoutingInput} from './routing-input.js';
import type {RoutingOutcome} from './routing-outcome.js';
import type {
  ClassifiedUsecase,
  DfsPath,
  EmittedUsecaseChange,
  KvResolution,
  OrphanCandidate,
  RoutingCombination,
  RoutingCone,
  RoutingSeed,
} from './routing-state.js';

export class RoutingContext {
  /** Immutable, handler-normalized input shared by every phase in one routing run. */
  readonly input: RoutingInput;
  /** File-wide UC catalog used for deletion-impact and duplicate analysis. */
  readonly allUcs: UseCase[] = [];
  /** System IDs of UCs affected by the current graph edits. */
  readonly affectedUcSystemIds: Set<number> = new Set();
  /** Affected UCs selected for deletion by Phase 2. */
  readonly ucsMarkedForDeletion: UseCase[] = [];
  /** Deletion-affected UCs preserved because an alternate valid path remains. */
  readonly deletionPreservedUcs: UseCase[] = [];
  /** Existing UCs that Phase 2 must change to ISLAND after link coverage is lost. */
  readonly usecasesToChangeToIsland: UseCase[] = [];
  /** Phase 2 paths reconstructed for UCs affected by deletion. */
  readonly deletionReconstructionPaths: DfsPath[] = [];
  /** Existing ISLAND UCs that Phase 3 can change to LINKED. */
  readonly islandUcsToLinked: UseCase[] = [];
  /** Phase 4 resolved SGKV selections used by later routing phases. */
  readonly kvResolutions: KvResolution[] = [];
  /** Effective-scope subgraph IDs classified as MDF; they contribute empty KVs. */
  readonly mdfSubgraphSystemIds = new Set<number>();
  /** Phase 5 routing starting points identified from graph edits. */
  readonly seeds: RoutingSeed[] = [];
  /** Phase 6 subgraph regions computed around the routing seeds. */
  readonly cones: RoutingCone[] = [];
  /** Phase 7 DFS paths, including any Phase 2 reconstruction paths. */
  readonly dfsPaths: DfsPath[] = [];
  /** Phase 8 UC candidates: path×KV in auto mode, SGKV Cartesian products in manual mode. */
  readonly routingCombinations: RoutingCombination[] = [];
  /** Phase 8 EC bridge candidates, kept separate until Phase 9 classification. */
  readonly ecBridgeCandidates: RoutingCombination[] = [];
  /** Phase 9 decisions for candidate UCs after GKV/topology matching and lifecycle checks. */
  readonly classifiedUcs: ClassifiedUsecase[] = [];
  /** Phase 10 orphan candidates found by effective-graph validation. */
  readonly orphanCandidates: OrphanCandidate[] = [];
  /** Non-blocking issues accumulated by phases; warnings do not stop the engine. */
  readonly warnings: Issue[] = [];
  /** Phase 11 canonical UC change descriptors returned in the routing outcome. */
  readonly emittedUcChanges: EmittedUsecaseChange[] = [];
  /** Phase 12 core result; this is not an HTTP response. */
  routingOutcome: RoutingOutcome | null = null;

  constructor(input: RoutingInput) {
    this.input = input;
  }
}
