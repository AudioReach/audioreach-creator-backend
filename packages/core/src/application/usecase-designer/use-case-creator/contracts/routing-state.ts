/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  type ChangeOperation,
  type Source,
} from '../../../shared/change-vocabulary.js';
import type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';

export type DeletionReason =
  | {
      readonly kind: 'component-deleted';
      readonly componentKind: 'subgraph' | 'data-link' | 'control-link';
      readonly componentSystemId: number;
    }
  | {readonly kind: 'pair-broken-single-path'}
  | {readonly kind: 'pair-broken-multi-path'};

export interface DataLinkLossPair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
  readonly deletedDataLinkSystemId: number;
}

export interface UsecaseDeletionMark {
  readonly usecase: UseCase;
  readonly reason: DeletionReason;
}

export interface DeletionPreservedUsecase {
  readonly usecase: UseCase;
  readonly droppedSubgraphSystemIds: readonly number[];
}

export interface IslandUseCaseCandidate {
  readonly usecase: UseCase;
  readonly dataLinkLossPairs: readonly DataLinkLossPair[];
}

export interface DeletionReconstructionPath {
  readonly originalUsecaseSystemId: number;
  readonly path: DfsPath;
}

export interface DeletionAnalysis {
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
  readonly markedForDeletion: readonly UsecaseDeletionMark[];
  readonly preservedUsecases: readonly DeletionPreservedUsecase[];
  readonly islandUseCaseCandidates: readonly IslandUseCaseCandidate[];
  readonly reconstructionPaths: readonly DeletionReconstructionPath[];
}

export interface DirectionCorrection {
  readonly currentSourceSubgraphSystemId: number;
  readonly currentDestSubgraphSystemId: number;
  readonly newSourceSubgraphSystemId: number;
  readonly newDestSubgraphSystemId: number;
}

export interface IslandTransition {
  readonly usecase: UseCase;
  readonly directionCorrections: readonly DirectionCorrection[];
  readonly addedSubgraphSystemIds: readonly number[];
  readonly addedPairs: readonly SubgraphPair[];
}

export interface RoutingCandidates {
  readonly combinations: readonly RoutingCombination[];
  readonly ecBridgeCandidates: readonly RoutingCombination[];
}

export interface KvResolution {
  readonly sgSystemId: number;
  readonly sgkvSystemId: number;
  readonly valueSystemIds: readonly number[];
}

export interface RoutingSeed {
  readonly subgraphSystemId: number;
}

export interface RoutingCone {
  readonly seedSubgraphSystemId: number;
  readonly subgraphSystemIds: readonly number[];
}

export interface DfsPath {
  readonly subgraphSystemIds: readonly number[];
}

export interface RoutingCombination {
  readonly subgraphSystemIds: readonly number[];
  readonly valueSystemIds: readonly number[];
}

export interface ClassifiedUsecase {
  readonly systemId: number;
  readonly action: ChangeOperation;
}

export const ORPHAN_KIND = {
  Subgraph: 'SUBGRAPH',
  Subsystem: 'SUBSYSTEM',
  DataLink: 'DATA_LINK',
  ControlLink: 'CONTROL_LINK',
} as const;

export type OrphanKind = (typeof ORPHAN_KIND)[keyof typeof ORPHAN_KIND];

export interface OrphanCandidate {
  readonly systemId: number;
  readonly kind: OrphanKind;
}

/** Internal write result retained until response projection. */
export interface UsecaseChangeDescriptor extends UsecaseChangeRef {
  readonly operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.None>;
  readonly source: Source;
}
