/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  type ChangeOperation,
  type Source,
} from '../../../shared/change-vocabulary.js';
import type {
  UsecaseChangeRef,
  UsecaseSgkvAssignment,
} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {ManualTopology} from './routing-input.js';

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

/** Identifies a stored pair that lost its data-link support but retains control-link support. */
export interface DataLinkLossPair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
  readonly deletedDataLinkSystemId: number;
}

/** Exact topology replacing one removed committed pair through MDF members. */
export interface MdfPairSubstitution {
  readonly removedPair: SubgraphPair;
  readonly replacementSubgraphSystemIds: readonly number[];
  readonly replacementPairs: readonly SubgraphPair[];
}

/**
 * Finalized structural change for one committed UseCase. Delta fields drive persistence;
 * resulting fields let later phases inspect the same post-change shape without rebuilding it.
 * This is distinct from `ProjectedUsecaseTopology`, the session-wide read model.
 */
export interface UsecaseStructuralChange {
  readonly addedSubgraphSystemIds: readonly number[];
  readonly removedSubgraphSystemIds: readonly number[];
  readonly addedPairs: readonly SubgraphPair[];
  readonly removedPairs: readonly SubgraphPair[];
  readonly resultingSubgraphSystemIds: readonly number[];
  readonly resultingPairs: readonly SubgraphPair[];
  readonly resultingType: UseCase['type'];
  readonly sgkvAssignments: readonly UsecaseSgkvAssignment[];
}

/** Phase 2 assigns exactly one of these outcomes to each impacted committed UseCase. */
export const USECASE_TOPOLOGY_DECISION_KIND = {
  MdfSubstitution: 'MDF_SUBSTITUTION',
  Preserve: 'PRESERVE',
  TransitionToIsland: 'TRANSITION_TO_ISLAND',
  DeleteOrReconstruct: 'DELETE_OR_RECONSTRUCT',
} as const;

export type UsecaseTopologyDecisionKind =
  (typeof USECASE_TOPOLOGY_DECISION_KIND)[keyof typeof USECASE_TOPOLOGY_DECISION_KIND];

/** Direct system-owned maintenance that preserves the existing UseCase identity. */
export interface MdfSubstitutionDecision {
  readonly kind: typeof USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution;
  readonly usecase: UseCase;
  readonly substitutions: readonly MdfPairSubstitution[];
  /** Shared by classification, orphan projection, collision replay, and staging. */
  readonly structuralChange: UsecaseStructuralChange;
}

/** Retains a safe multi-path UseCase while removing members deleted from the routing scope. */
export interface PreserveUsecaseDecision {
  readonly kind: typeof USECASE_TOPOLOGY_DECISION_KIND.Preserve;
  readonly usecase: UseCase;
  readonly droppedSubgraphSystemIds: readonly number[];
}

/**
 * Retains a UseCase after data-link loss by changing it to ISLAND while preserving
 * control-link-supported topology and removing any safely dropped members.
 */
export interface TransitionToIslandDecision {
  readonly kind: typeof USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland;
  readonly usecase: UseCase;
  readonly dataLinkLossPairs: readonly DataLinkLossPair[];
  readonly droppedSubgraphSystemIds: readonly number[];
}

/**
 * Retires an invalid committed UseCase. Automatic routing may attach bounded successor
 * paths; manual routing leaves those paths empty and requires explicit user topology.
 */
export interface DeleteOrReconstructDecision {
  readonly kind: typeof USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct;
  readonly usecase: UseCase;
  readonly deletedComponent: DeletedComponent;
  readonly reconstructionPaths: readonly DfsPath[];
}

export type UsecaseTopologyDecision =
  | MdfSubstitutionDecision
  | PreserveUsecaseDecision
  | TransitionToIslandDecision
  | DeleteOrReconstructDecision;

/**
 * Complete Phase 2 output published once to later phases. The affected set controls
 * ordinary deletion gates, whereas decisions also include direct MDF maintenance writes.
 */
export interface TopologyChangeAnalysis {
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
  readonly decisions: readonly UsecaseTopologyDecision[];
}

export interface DirectionCorrection {
  readonly currentSourceSubgraphSystemId: number;
  readonly currentDestSubgraphSystemId: number;
  readonly newSourceSubgraphSystemId: number;
  readonly newDestSubgraphSystemId: number;
}

/** Phase 3 work that can promote an ISLAND UseCase when effective routing supports it. */
export interface IslandTransition {
  readonly usecase: UseCase;
  readonly directionCorrections: readonly DirectionCorrection[];
  readonly addedSubgraphSystemIds: readonly number[];
  readonly addedPairs: readonly SubgraphPair[];
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

interface UsecaseCandidateBase {
  readonly sgkvAssignment: ReadonlyMap<number, SgkvInstance>;
  readonly gkv: readonly KvPair[];
}

export const USECASE_CANDIDATE_KIND = {
  Auto: 'AUTO',
  Manual: 'MANUAL',
  EcBridge: 'EC_BRIDGE',
} as const;

export interface AutoUsecaseCandidate extends UsecaseCandidateBase {
  readonly kind: typeof USECASE_CANDIDATE_KIND.Auto;
  readonly path: DfsPath;
}

export interface ManualUsecaseCandidate extends UsecaseCandidateBase {
  readonly kind: typeof USECASE_CANDIDATE_KIND.Manual;
  readonly memberSubgraphSystemIds: readonly number[];
  readonly topology: ManualTopology;
}

export interface EcBridgeUsecaseCandidate extends UsecaseCandidateBase {
  readonly kind: typeof USECASE_CANDIDATE_KIND.EcBridge;
  readonly path: DfsPath;
}

export type RoutedUsecaseCandidate =
  | AutoUsecaseCandidate
  | EcBridgeUsecaseCandidate;

export type UsecaseCandidate =
  | AutoUsecaseCandidate
  | ManualUsecaseCandidate
  | EcBridgeUsecaseCandidate;

export interface UsecaseCandidates {
  readonly automaticCandidates: AutoUsecaseCandidate[];
  readonly manualCandidates: ManualUsecaseCandidate[];
  readonly ecBridgeCandidates: EcBridgeUsecaseCandidate[];
}

export const ROUTING_CLASSIFICATION_KIND = {
  Create: 'CREATE',
  ExactMatch: 'EXACT_MATCH',
  InteriorExtension: 'INTERIOR_EXTENSION',
} as const;

export interface CreateUsecaseClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.Create;
  readonly candidate: UsecaseCandidate;
}

export interface ExactMatchClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.ExactMatch;
  readonly candidate: UsecaseCandidate;
  readonly existingUsecase: UseCase;
}

export interface InteriorExtensionClassification {
  readonly kind: typeof ROUTING_CLASSIFICATION_KIND.InteriorExtension;
  readonly candidate: RoutedUsecaseCandidate;
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
