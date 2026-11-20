/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityRef} from '../identity/entity-identity.js';
import type {ISSUE_CODE} from '../../shared/issues/operational-codes.js';

/** No related entities, params, or fix options. */
export type NoContext = Record<never, never>;

/** A value in `params`: machine context that is not an entity. */
export type ParamValue = string | number;

/**
 * One entry in a list of groups: entities that belong together, such as the
 * key and the two subgraphs of one KV conflict. A group holds entities and
 * lists of entities only; groups are not nested.
 *
 * @example One KV conflict of `ROUTING_DFS_NO_VALID_COMBINATION`:
 * ```ts
 * {
 *   key: {entityType: 'KeyDefinition', systemId: 0x10},
 *   subgraphs: [
 *     {entityType: 'Subgraph', systemId: 5},
 *     {entityType: 'Subgraph', systemId: 6},
 *   ],
 * }
 * ```
 */
export type RelatedEntityGroup = Readonly<
  Record<string, EntityRef | readonly EntityRef[] | undefined>
>;

/**
 * A value in `relatedEntities`: one entity, a list, or a list of groups.
 *
 * @example The three forms, each under its role:
 * ```ts
 * // One entity (ROUTING_PREVAL_DATALINK_INTEGRITY)
 * source: {entityType: 'Subgraph', systemId: 5}
 *
 * // A list of entities (ROUTING_EC_MULTIPLE_LINKS)
 * ecDataLinks: [
 *   {entityType: 'DataLink', systemId: 0x20},
 *   {entityType: 'DataLink', systemId: 0x21},
 * ]
 *
 * // A list of groups (ROUTING_DFS_NO_VALID_COMBINATION)
 * conflicts: [
 *   {key: {entityType: 'KeyDefinition', systemId: 0x10}, subgraphs: [...]},
 *   {key: {entityType: 'KeyDefinition', systemId: 0x11}, subgraphs: [...]},
 * ]
 * ```
 */
export type RelatedEntitiesValue =
  | EntityRef
  | readonly EntityRef[]
  | readonly RelatedEntityGroup[];

/**
 * Related entities by role. The role names come from the code's entry in
 * `IssueContextMap`; an optional role may be left out.
 *
 * @example `relatedEntities` of `ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT`:
 * ```ts
 * {
 *   subgraphs: [{entityType: 'Subgraph', systemId: 7}],
 *   dataLinks: [],
 *   controlLinks: [{entityType: 'ControlLink', systemId: 0x30}],
 * }
 * ```
 */
type RelatedEntities = Readonly<
  Record<string, RelatedEntitiesValue | undefined>
>;

/** Params by name. */
type Params = Readonly<Record<string, ParamValue>>;

/** The context of one fix-option kind. */
interface Context<
  R extends RelatedEntities = NoContext,
  P extends Params = NoContext,
> {
  relatedEntities: R;
  params: P;
}

/** The context of one issue code, with the fix-option kinds it offers. */
interface CodeContext<
  R extends RelatedEntities = NoContext,
  P extends Params = NoContext,
  F extends Readonly<Record<string, Context<RelatedEntities, Params>>> =
    NoContext,
> extends Context<R, P> {
  fixOptions: F;
}

type Subgraphs = readonly EntityRef<'Subgraph'>[];
type DataLinks = readonly EntityRef<'DataLink'>[];
type ControlLinks = readonly EntityRef<'ControlLink'>[];
type ValueDefinitions = readonly EntityRef<'ValueDefinition'>[];
type ChainNode = EntityRef<'SpfModule'> | EntityRef<'Subsystem'>;

/** The subgraphs and links that a request or edit refers to but are missing. */
type MissingComponents = CodeContext<{
  subgraphs: Subgraphs;
  dataLinks: DataLinks;
  controlLinks: ControlLinks;
}>;

/**
 * The context of every issue code that is produced as a fact, keyed by the
 * code's wire value. A code is added here when its producer is converted.
 *
 * Lists in `relatedEntities` are not repeated in the message; the message
 * names single entities and describes the lists.
 */
export interface IssueContextMap {
  [ISSUE_CODE.ENTITY_NOT_FOUND]: CodeContext;

  [ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION]: CodeContext<{
    subgraphs: Subgraphs;
  }>;
  /** The entities added in this session that the request does not include. */
  [ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT]: MissingComponents;
  /** `impactedEntity`: the data link; one or both endpoints are missing. */
  [ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY]: CodeContext<{
    source: EntityRef<'Subgraph'>;
    destination: EntityRef<'Subgraph'>;
  }>;
  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN]: CodeContext<{
    startModule: EntityRef<'SpfModule'>;
    lastReachableNode: ChainNode;
  }>;
  [ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN]: CodeContext<{
    reachableNodes: readonly ChainNode[];
  }>;
  [ISSUE_CODE.ROUTING_MDF_KV_ASSIGNED]: CodeContext;
  [ISSUE_CODE.ROUTING_ISLAND_DETECTED]: CodeContext;
  /** `unselectedUsecases`: affected use cases the request does not include. */
  [ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED]: CodeContext<{
    unselectedUsecases: readonly EntityRef<'UseCase'>[];
  }>;
  /** The remaining topology that the request does not include. */
  [ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE]: MissingComponents;
  /** `impactedEntity`: the link; `subgraph`: its uncovered endpoint. */
  [ISSUE_CODE.ROUTING_INTER_USECASE_ENDPOINT_UNCOVERED]: CodeContext<{
    subgraph: EntityRef<'Subgraph'>;
  }>;
  /** `lostConnections`: subgraph pairs whose only data link was deleted. */
  [ISSUE_CODE.ROUTING_UC_AUTO_ISLAND]: CodeContext<{
    lostConnections: readonly {
      readonly source: EntityRef<'Subgraph'>;
      readonly destination: EntityRef<'Subgraph'>;
      readonly deletedDataLink: EntityRef<'DataLink'>;
    }[];
  }>;
  /** `values`: values of the same key assigned to one subgraph. */
  [ISSUE_CODE.ROUTING_SGKV_MALFORMED]: CodeContext<{values: ValueDefinitions}>;
  /** `values`: values missing from the file's definitions. */
  [ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND]: CodeContext<{
    values: ValueDefinitions;
  }>;
  [ISSUE_CODE.ROUTING_CYCLE_DETECTED]: CodeContext;
  /** `cycle`: the subgraphs in cycle order; `dataLinks`: links forming it. */
  [ISSUE_CODE.ROUTING_MANUAL_CYCLE]: CodeContext<{
    cycle: Subgraphs;
    dataLinks: DataLinks;
  }>;
  /** `subgraphs`: the subgraphs of the requested manual topology. */
  [ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT]: CodeContext<{
    gkvValues: ValueDefinitions;
    subgraphs: Subgraphs;
  }>;
  /** `conflicts`: each key with the two subgraphs that disagree on it. */
  [ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION]: CodeContext<{
    path: Subgraphs;
    conflicts: readonly {
      readonly key: EntityRef<'KeyDefinition'>;
      readonly subgraphs: Subgraphs;
    }[];
  }>;
  /** `impactedEntity`: the use case. */
  [ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS]: CodeContext<
    {ecDataLinks: DataLinks},
    {pairCount: number}
  >;
  /** `impactedEntity`: the second EC data link. */
  [ISSUE_CODE.ROUTING_EC_MULTIPLE_ON_PATH]: CodeContext<{
    path: Subgraphs;
    firstEcDataLink: EntityRef<'DataLink'>;
    secondEcDataLink: EntityRef<'DataLink'>;
  }>;
  /** `keys`: the keys on which the path's subgraphs conflict. */
  [ISSUE_CODE.ROUTING_EC_BRIDGE_INCOMPATIBLE]: CodeContext<{
    path: Subgraphs;
    ecDataLinks: DataLinks;
    keys: readonly EntityRef<'KeyDefinition'>[];
  }>;
  /**
   * `impactedEntity`: the edited use case, missing when it no longer exists.
   * The lists hold the components the edit refers to that no longer exist.
   */
  [ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS]: CodeContext<
    MissingComponents['relatedEntities'],
    NoContext,
    {DELETE_STALE_EDIT: Context}
  >;
  /** `gkvValues`: the key values that the manual edits share. */
  [ISSUE_CODE.ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES]: CodeContext<{
    gkvValues: ValueDefinitions;
  }>;
  /**
   * Fix-option kinds are the `COLLISION_RESOLUTION_MODE` values, written as
   * literals because domain cannot import application. `usecase` is the
   * existing use case of the collision, when there is one.
   */
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED]: CodeContext<
    {gkvValues: ValueDefinitions},
    {collisionId: string},
    {
      SELECT_CANDIDATE: Context<
        {usecase?: EntityRef<'UseCase'>; subgraphs: Subgraphs},
        {candidateNumber: number}
      >;
      KEEP_EXISTING: Context<{
        usecase: EntityRef<'UseCase'>;
        subgraphs: Subgraphs;
      }>;
      MERGE_ALL: Context<{
        usecase?: EntityRef<'UseCase'>;
        subgraphs: Subgraphs;
      }>;
    }
  >;
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE]: CodeContext<
    NoContext,
    {collisionId: string}
  >;
  [ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH]: CodeContext;
  [ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS]: CodeContext;
  [ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM]: CodeContext;
  [ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK]: CodeContext;
  [ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK]: CodeContext;
  [ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING]: CodeContext<{
    source: EntityRef<'Subgraph'>;
    destination: EntityRef<'Subgraph'>;
  }>;
}

/** An issue code that is produced as a fact. */
export type IssueFactCode = keyof IssueContextMap;
