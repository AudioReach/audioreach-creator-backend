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
  /** Immutable request and derived input. */
  readonly input: RoutingInput;
  /** UCs loaded for deletion and duplicate checks. */
  readonly allUcs: UseCase[] = [];
  /** Excluded data links for graph reads. */
  readonly excludedDataLinkSystemIds: Set<number>;
  /** Excluded control links for graph reads. */
  readonly excludedControlLinkSystemIds: Set<number>;
  /** Excluded SGs for graph reads. */
  readonly excludedSubgraphSystemIds: Set<number>;
  /** UCs affected by graph edits, including deletion and degradation candidates. */
  readonly affectedUcSystemIds: Set<number> = new Set();
  /** UCs selected for deletion. */
  readonly markedForDeletion: UseCase[] = [];
  /** Deletion candidates kept by alternate paths. */
  readonly deletionPreservedUcs: UseCase[] = [];
  /** UCs whose link coverage was degraded. */
  readonly degradedToIsland: UseCase[] = [];
  /** Paths rebuilt after structural changes. */
  readonly reconstructionPaths: DfsPath[] = [];
  /** Island UCs promoted to linked. */
  readonly islandTransitions: UseCase[] = [];
  /** Resolved SGKV selections. */
  readonly kvResolutions: KvResolution[] = [];
  /** Graph-edit routing starting points. */
  readonly seeds: RoutingSeed[] = [];
  /** Search bounds around each seed. */
  readonly cones: RoutingCone[] = [];
  /** Routed SG paths. */
  readonly dfsPaths: DfsPath[] = [];
  /** Candidate UCs expanded from paths and SGKVs. */
  readonly combinations: RoutingCombination[] = [];
  /** EC bridge candidates. */
  readonly ecBridgeCandidates: RoutingCombination[] = [];
  /** Candidates classified into UC changes. */
  readonly classified: ClassifiedUsecase[] = [];
  /** Orphans found in the effective graph. */
  readonly orphans: OrphanCandidate[] = [];
  /** Non-blocking routing issues. */
  readonly warnings: Issue[] = [];
  /** Emitted UseCase edit actions awaiting outcome grouping. */
  readonly emittedChanges: EmittedUsecaseChange[] = [];
  /** Final API-independent routing result. */
  response: RoutingOutcome | null = null;

  constructor(input: RoutingInput) {
    this.input = input;
    this.excludedDataLinkSystemIds = new Set(
      input.excludedDataLinkSystemIds,
    );
    this.excludedControlLinkSystemIds = new Set(
      input.excludedControlLinkSystemIds,
    );
    this.excludedSubgraphSystemIds = new Set(
      input.excludedSubgraphSystemIds,
    );
  }

}
