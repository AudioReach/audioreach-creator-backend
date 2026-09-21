/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {SubgraphPropertyDefinition} from '../../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import type {KvPair} from '../shared/kv-pair.js';
import type {SessionChanged} from '../shared/session-changed.js';

/**
 * Routing query model for one SGKV instance. Returned by
 * SubgraphRepository.getSgkvs. Carries full KV-pair info so callers
 * never need a separate keyDef lookup.
 */
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
   * Returns SgkvEntry objects for each SGKV belonging to the given SGs.
   * Joins sgkv → sgkv_values → value_definitions in one query.
   */
  getSgkvs(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<SgkvEntry[]>;

  /**
   * Resolves requested Value Definitions to their owning Keys in the
   * effective, file-scoped definition overlay. Missing values are omitted.
   */
  resolveKeyValues(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<KvPair[]>;

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
