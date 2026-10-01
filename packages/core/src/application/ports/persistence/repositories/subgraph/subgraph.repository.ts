/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {VcpmInstance} from '../../../../../domain/entities/usecase-data/subgraph/entities/vcpm-module-instance.js';
import type {SubgraphPropertyDefinition} from '../../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import type {KvPair} from '../shared/kv-pair.js';
import type {SessionChanged} from '../shared/session-changed.js';

/** A subgraph key/value instance with its resolved key and value definitions. */
export interface SgkvEntry {
  sgSystemId: number;
  sgkvSystemId: number;
  keyValues: KvPair[];
}

export interface SubgraphRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>;

  nameExists(
    name: string,
    fileSystemId: number,
    excludedSystemId: number,
  ): Promise<boolean>;

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
   * Returns the usecaseSystemId that owns the given subgraph (via
   * use_case_subgraphs). Returns null if not found.
   * Used to validate INTER_USECASE links (FR-DL-09).
   */
  getUsecaseSystemIdForSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<number | null>;

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

  /**
   * Returns subgraphs with overlay-aware property rows.
   * Returns a map of subgraphSystemId → hydrated Subgraph.
   * Missing subgraphs are absent from the map (not null entries).
   * Uses 2 queries total regardless of how many IDs are passed.
   */
  getAggregates(
    subgraphSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, Subgraph>>;

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
  removeAllVcpmData(subgraphSystemId: number): Promise<void>;

  /**
   * Stages a VCPM instance with its single default CKV and parameter payloads.
   * The map resolves each parameter system ID to its payload row system ID.
   */
  addVcpmModule(
    instance: VcpmInstance,
    payloadSystemIdsByParameterSystemId: ReadonlyMap<number, number>,
  ): Promise<void>;

  /**
   * Resolves requested Value Definitions to their owning Keys in the
   * effective, file-scoped definition overlay. Missing values are omitted.
   */
  resolveKeyValues(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<KvPair[]>;

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
