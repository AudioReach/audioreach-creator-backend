/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {BatchRead} from '../../batch-read.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {VcpmInstance} from '../../../../../domain/entities/usecase-data/subgraph/entities/vcpm-module-instance.js';
import type {SubgraphPropertyDefinition} from '../../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import type {SessionChanged} from '../shared/session-changed.js';
import type {SubgraphQueryService} from '../../query-services/subgraph/subgraph-query-service.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

/**
 * `Subgraph` writes, plus the reads that only commands need.
 *
 * Inherits every `SubgraphQueryService` read so commands run them inside
 * their own transaction and see their uncommitted writes.
 */
export interface SubgraphRepository extends SubgraphQueryService {
  nameExists(
    name: string,
    fileSystemId: number,
    excludedSubgraphSystemId: number,
  ): Promise<boolean>;

  deleteSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Stages CREATE rows for the Subgraph aggregate root and all its
   * SubgraphPropertyData children.
   * The ambient groupId is command/response correlation and is not persisted
   * on the staged rows.
   */
  createSubgraph(subgraph: Subgraph, options?: EditOptions): Promise<void>;

  /** Returns effective subgraph property definitions for the active session. */
  getPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDefinition[]>;

  /**
   * Loads the requested subgraphs as aggregates, with their property rows,
   * for commands that change them. Missing IDs are reported in `failed` as
   * `NOT_FOUND`.
   */
  findSubgraphAggregates(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<BatchRead<Subgraph, typeof ENTITY_TYPE.Subgraph>>;

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
  deleteProperty(
    subgraphSystemId: number,
    propertyDataSystemId: number,
  ): Promise<void>;

  /** Stages deletion of all VCPM configuration data for a subgraph. */
  deleteAllVcpmData(subgraphSystemId: number): Promise<void>;

  /**
   * Stages a VCPM instance with its single default CKV and parameter payloads.
   * The map resolves each parameter system ID to its payload row system ID.
   */
  addVcpmModule(
    instance: VcpmInstance,
    payloadSystemIdsByParameterSystemId: ReadonlyMap<number, number>,
  ): Promise<void>;

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
