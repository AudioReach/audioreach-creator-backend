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
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';

export const DELETED_COMPONENT_TYPE = {
  Subgraph: 'SUBGRAPH',
  DataLink: 'DATA_LINK',
  ControlLink: 'CONTROL_LINK',
} as const;

export type DeletedComponentType =
  (typeof DELETED_COMPONENT_TYPE)[keyof typeof DELETED_COMPONENT_TYPE];

export interface DeletedComponent {
  readonly type: DeletedComponentType;
  readonly systemId: number;
}

export interface DataLinkLossPair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
  readonly deletedDataLinkSystemId: number;
}

export interface UsecaseDeletionMark {
  readonly usecase: UseCase;
  /** The highest-precedence deleted component that requires this UC to be removed. */
  readonly deletedComponent: DeletedComponent;
}

/**
 * An affected multi-path UseCase kept by automatic deletion analysis because
 * every stored pair remains supported. Staging removes only the listed deleted
 * subgraphs instead of deleting the UseCase.
 */
export interface DeletionPreservedUsecase {
  readonly usecase: UseCase;
  /** Deleted subgraphs that have no incident stored pairs in this UseCase. */
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

export interface SgkvInstance {
  readonly keyValues: readonly KvPair[];
}

export interface KvResolutions {
  readonly perSg: ReadonlyMap<number, readonly SgkvInstance[]>;
  readonly ucFilteredBaseline: ReadonlyMap<number, readonly SgkvInstance[]>;
}

export const SEED_REASON = {
  KvChanged: 'KV_CHANGED',
  NewSubgraph: 'NEW_SUBGRAPH',
  LinkAdded: 'LINK_ADDED',
  LinkDeleted: 'LINK_DELETED',
  NoUsecaseContext: 'NO_USECASE_CONTEXT',
  OutOfSelection: 'OUT_OF_SELECTION',
} as const;

export type SeedReason = (typeof SEED_REASON)[keyof typeof SEED_REASON];

export interface Seeds {
  readonly sgSystemIds: ReadonlySet<number>;
  readonly reasons: ReadonlyMap<number, SeedReason>;
}

export interface Cones {
  readonly sgSystemIds: ReadonlySet<number>;
  readonly rootSgs: ReadonlySet<number>;
}

export const PATH_TERMINATION = {
  NaturalLeaf: 'NATURAL_LEAF',
  Cycle: 'CYCLE',
  EcBoundary: 'EC_BOUNDARY',
} as const;

export type PathTermination =
  (typeof PATH_TERMINATION)[keyof typeof PATH_TERMINATION];

export interface DfsPath {
  readonly subgraphSystemIds: readonly number[];
  readonly termination: PathTermination;
  readonly ecBoundaryLinkId: number | null;
}

export interface RoutingCombination {
  readonly path: DfsPath;
  readonly sgkvAssignment: ReadonlyMap<number, SgkvInstance>;
  readonly gkv: readonly KvPair[];
}

export const ROUTING_CLASSIFICATION_KIND = {
  Create: 'CREATE',
  ExactMatch: 'EXACT_MATCH',
  InteriorExtension: 'INTERIOR_EXTENSION',
} as const;

export interface CreateUsecaseClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.Create;
  readonly candidate: RoutingCombination;
}

export interface ExactMatchClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.ExactMatch;
  readonly candidate: RoutingCombination;
  readonly existingUsecase: UseCase;
}

export interface InteriorExtensionClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.InteriorExtension;
  readonly candidate: RoutingCombination;
  readonly existingUsecase: UseCase;
  readonly cancelPendingDelete: boolean;
}

export type ClassifiedUsecase =
  | CreateUsecaseClassification
  | ExactMatchClassification
  | InteriorExtensionClassification;

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
