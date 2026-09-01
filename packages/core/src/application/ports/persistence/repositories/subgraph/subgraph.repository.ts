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
import type {ParameterDefinitionBase} from '../module/module-definition.repository.js';

export interface VcpmPayloadRow {
  systemId: number;
  vcpmParameterSystemId: number;
}

export interface VcpmPayloadUpdate {
  payloadSystemId: number;
  payload: Uint8Array;
}

export interface SubgraphRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>;

  deleteSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

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
   * Returns Subgraph aggregates by systemId. Missing IDs silently omitted.
   */
  findByIds(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<Subgraph[]>;

  /**
   * Returns Subgraphs qualifying as MDF — exactly 2 modules:
   * IPC_TX (module_definition_id = 0x7001184) + IPC_RX (0x7001185).
   * isMdf is NOT a persisted column; computed from module composition.
   * Consumer: LLD1 §6.3 FR-KV-03 IsMdf auto-population (Phase 4).
   */
  findIsMdfInScope(
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

  getVcpmInstanceSystemId(
    subgraphSystemId: number,
    vcpmDefinitionSystemId: number,
  ): Promise<number | null>;

  vcpmCkvExists(
    instanceSystemId: number,
    valueSystemIds: number[],
  ): Promise<boolean>;

  vcpmCkvExistsBySystemId(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<boolean>;

  createVcpmCkv(
    subgraphSystemId: number,
    instanceSystemId: number,
    valueSystemIds: number[],
    params: ParameterDefinitionBase[],
  ): Promise<number>;

  deleteVcpmCkv(subgraphSystemId: number, ckvSystemId: number): Promise<void>;

  getVcpmCkvPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<VcpmPayloadRow[]>;

  updateVcpmCalData(
    subgraphSystemId: number,
    ckvSystemId: number,
    updates: VcpmPayloadUpdate[],
  ): Promise<void>;
}
