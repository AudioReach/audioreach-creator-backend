/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {SubgraphPropertyDefinition} from '../../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import type {KvPair} from '../shared/kv-pair.js';
import type {SessionChanged} from '../shared/session-changed.js';

export interface SubgraphWithProperties {
  systemId: number;
  properties: Array<{
    systemId: number;
    propertySystemId: number;
    payload: Uint8Array | null;
  }>;
}

/** A subgraph key/value instance with its resolved key and value definitions. */
export interface SgkvEntry {
  sgSystemId: number;
  sgkvSystemId: number;
  keyValues: KvPair[];
}

export interface SubgraphRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>;

  deleteSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /** Returns SGKV instances for the requested subgraphs. */
  getSgkvs(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<SgkvEntry[]>;

  /**
   * Stages CREATE rows for the Subgraph aggregate root and all its
   * SubgraphPropertyData children.
   * All rows share the ambient groupId so the whole creation is one undo unit.
   */
  createSubgraph(subgraph: Subgraph, options?: EditOptions): Promise<void>;

  /** Returns effective subgraph property definitions for the active session. */
  getPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDefinition[]>;

  /** Returns effective subgraph property definitions for the active session. */
  getPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDefinition[]>;

  /** Returns subgraph with overlay-aware property rows. null if not found. */
  getAggregate(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<SubgraphWithProperties | null>;

  /**
   * Batch variant of getAggregate.
   * Returns a map of subgraphSystemId → SubgraphWithProperties.
   * Missing subgraphs are absent from the map (not null entries).
   * Uses 2 queries total regardless of how many IDs are passed.
   */
  getAggregates(
    subgraphSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, SubgraphWithProperties>>;

  /** Returns linked subgraphs reachable through shared use cases. */
  getSubgraphIdsInSameUsecasesForMany(
    subgraphSystemIds: number[],
    fileSystemId: number,
  ): Promise<number[]>;

  /** Stages a new SubgraphPropertyData row with a prepared payload. */
  addProperty(
    subgraphSystemId: number,
    propertySystemId: number,
    payload: Uint8Array,
  ): Promise<number>;

  /** Stages a name delta on the Subgraph row. */
  rename(subgraphSystemId: number, name: string): Promise<void>;

  /**
   * Stages a payload delta on an existing SubgraphPropertyData row.
   * Throws if the property row does not exist.
   */
  setPropertyData(
    subgraphSystemId: number,
    propertySystemId: number,
    data: Uint8Array,
  ): Promise<void>;

  /** Stages deletion of an existing SubgraphPropertyData row. */
  removeProperty(
    subgraphSystemId: number,
    propertyDataSystemId: number,
  ): Promise<void>;

  /** Stages deletion of all VCPM configuration data for a subgraph. */
  removeAllVcpmCfgData(subgraphSystemId: number): Promise<void>;

  /**
   * Returns Subgraph aggregates by systemId. Missing IDs silently omitted.
   */
  findByIds(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<Subgraph[]>;

  /**
   * Returns Subgraphs added or deleted in the current session — a
   * `SessionChanged<Subgraph>` split. No `source` filter is applied; MANUAL
   * and DIFF_TOOL edit_actions are both included, and routing itself never
   * writes SGs so AUTO_ROUTING is inherently absent from this table.
   *
   * UPDATE-shaped edit_actions on SGs (e.g. name / isImported metadata
   * patches) are excluded from both buckets — this method surfaces
   * topology-level additions and removals only.
   *
   * Consumer: routing engine graphEdits assembly (addedSgs / deletedSgs).
   */
  findChangedInSession(fileSystemId: number): Promise<SessionChanged<Subgraph>>;
}
