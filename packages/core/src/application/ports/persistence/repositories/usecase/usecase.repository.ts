/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseType} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../shared/links-for-pair.js';
export type {ReadMode, ReadOptions} from '../shared/read-options.js';
export {READ_MODE} from '../shared/read-options.js';
import type {ReadOptions} from '../shared/read-options.js';

/**
 * Components referenced by a manually-created or user-chosen UseCase
 * edit-action. Serialized into `edit_actions.new_value` alongside the
 * CREATE / structural-change payload so that FR-COMMIT-01(d) and the
 * routing-time pre-check (ARC-ROUTING-MANUAL-UC-BROKEN-DEPS) can validate
 * every listed component still exists in the effective post-commit graph.
 *
 * Consumers: `create-manual-usecase`  `ResolveSameGkvCollisionCommand`
 * apply-fix for FR-DUP-04. Auto-routing writes omit this.
 */
export interface ReferencedComponents {
  sgSystemIds: number[];
  dataLinkSystemIds: number[];
  controlLinkSystemIds: number[];
}

/**
 * Structural delta applied atomically to a UseCase by
 * `applyStructuralChange`. All fields optional; the adapter emits a group of
 * edit-actions sharing one groupId reflecting the union of changes.
 *
 * Cases where this is used:
 *   - FR-DUP-03(b1) identity-preserving interior extension (add interior
 *     SGs + replace pair set + possibly recompute type; may un-mark from
 *     deletion).
 *   - FR-STATUS-04 Disconnected → Connected transition (add bridge SGs +
 *     add bridge-mediated pairs + change type).
 *   - FR-DEL-05 preserve-Disconnected trim (remove SGs + remove pairs +
 *     change type → Disconnected).
 *   - FR-DUP-04 MERGE apply-fix (add SGs + add pairs + change type;
 *     `referencedComponents` also provided).
 *   - FR-EC-07 Rule D un-mark on legacy UC reconstruction match
 *     (`cancelPendingDelete: true`; may also add SGs / pairs).
 */
export interface StructuralDelta {
  addedSgSystemIds?: readonly number[];
  removedSgSystemIds?: readonly number[];
  addedPairs?: readonly SubgraphPair[];
  removedPairs?: readonly SubgraphPair[];
  /**
   * Recomputed UsecaseType per FR-EC-07 Rule E (or FR-STATUS-04 transition,
   * or preserve-Disconnected trim). Omit when the structural change does
   * not affect type.
   */
  newType?: UsecaseType;
  /**
   * If true, the adapter cancels any pending `DELETE UseCase` edit-action
   * currently staged for this UC (FR-EC-07 Rule D — legacy EC UC that was
   * marked for deletion by Phase 2 gets un-marked when Phase 9 matches it
   * via FR-DUP-03(b1) silent auto-update).
   */
  cancelPendingDelete?: boolean;
}

/**
 * `UseCase` aggregate write path + a minimal read path for the routing
 * engine and manual-UC flow.
 */
export interface UsecaseRepository {
  /**
   * Returns the UCs on `fileSystemId` whose `systemId` is in `ucSystemIds`.
   * Empty input → []. Missing IDs are silently omitted.
   *
   * `readMode` defaults to `READ_MODE.Overlay`. Phase 2 in automatic-uc-creation -impact detection
   * uses `READ_MODE.Committed` to see pre-session state.
   */
  findBySystemIds(
    fileSystemId: number,
    ucSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<UseCase[]>;

  /**
   * Returns all UCs on `fileSystemId`. `readMode` defaults to
   * `READ_MODE.Overlay`. Phase 2 (LLD4) uses `READ_MODE.Committed` to
   * populate `context.allUcs` at the start of routing — subsequent phases
   * filter this in memory (findByContainingSg, findByContainingLink,
   * findByGkv, findLegacyEcUcsContainingPair, findByStatus) rather than
   * making additional repo calls.
   */
  findAll(fileSystemId: number, options?: ReadOptions): Promise<UseCase[]>;

  /**
   * Returns UCs that are the target of at least one **active MANUAL**
   * edit-action on this file — i.e., an `edit_actions` row with
   * `target_table='UseCase'`, `source='MANUAL'`, and `valid_until IS NULL`
   * (not superseded, not committed).
   *
   * Consumer: PR 6 Phase 9 stale-MANUAL pre-check for FR-DUP-04. Phase 9
   * parses each edit-action's `referencedComponents` payload and verifies
   * every listed SG/link still exists in the effective post-commit graph;
   * if any is missing, routing halts with
   * `ARC-ROUTING-MANUAL-UC-BROKEN-DEPS`.
   *
   * Why no `change_status` filter: MANUAL edit-actions may resolve to
   * either `STAGED` or `UNSTAGED` depending on the framework's current
   * REQ-EA-05 policy (see chapter preface "Design Note" on the pending
   * decision). This query is defined in terms of source only —
   * source='MANUAL' identifies user-authored edit-actions regardless of
   * staging policy.
   * Not affected by `readMode` — this query is inherently about
   * `edit_actions` state, not overlay-vs-committed base rows.
   */
  findWithActiveManualEdits(fileSystemId: number): Promise<UseCase[]>;

  /**
   * Creates a UseCase. Emits a CREATE `edit_actions` row for the base
   * `UseCase` row plus one CREATE per element of `uc.subgraphSystemIds`
   * (in `UseCaseSubgraph`) and per `uc.subgraphPairs` element (in
   * `UseCaseSubgraphPair`), all sharing the ambient groupId.
   *
   * When `referencedComponents` is provided the payload is merged into the
   * base UseCase CREATE row's `new_value` for FR-COMMIT-01(d) /
   * ARC-ROUTING-MANUAL-UC-BROKEN-DEPS integrity checks. Auto-routing
   * (Phase 11) omits the third parameter.
   */
  create(
    uc: UseCase,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<void>;

  /**
   * Soft-deletes a UseCase by emitting a DELETE `edit_actions` row on the
   * base `UseCase` row. Junction rows (`use_case_subgraphs`,
   * `use_case_subgraph_pairs`) cascade at the physical layer on flush.
   */
  delete(ucSystemId: number, options?: EditOptions): Promise<void>;

  /**
   * Applies a routing-shaped structural delta to `uc`. Emits one atomic
   * group of `edit_actions` sharing the ambient groupId, covering
   * (in the following order):
   *   1. optional `cancelPendingDelete` (removes any pending
   *      `DELETE UseCase` edit-action for this UC — FR-EC-07 Rule D).
   *   2. `removedPairs` → per-pair DELETE on `UseCaseSubgraphPair`.
   *   3. `removedSgSystemIds` → per-SG DELETE on `UseCaseSubgraph`.
   *   4. `addedSgSystemIds` → per-SG CREATE on `UseCaseSubgraph`.
   *   5. `addedPairs` → per-pair CREATE on `UseCaseSubgraphPair`.
   *   6. optional `newType` → base-row UPDATE on `UseCase`.
   *
   * When `referencedComponents` is provided it is merged into the base-row
   * UPDATE's `new_value` (creating one if `newType` is absent — the row
   * exists solely to carry the payload) for FR-COMMIT-01(d) integrity checks.
   */
  applyStructuralChange(
    ucSystemId: number,
    delta: StructuralDelta,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<void>;

  /**
   * Type-only mutation. Emits a single UPDATE delta on the `UseCase` row
   * setting `type`. Used by FR-STATUS-02(b) auto-degrade and pure
   * FR-EC-07 Rule E recompute where no SG/pair set change accompanies the
   * type change. When SG/pair mutations DO accompany a type change, callers
   * use `applyStructuralChange` with `newType` set instead.
   */
  changeType(
    ucSystemId: number,
    newType: UsecaseType,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Reverses the stored direction of a specific pair inside `uc`.
   *
   * Identifies the pair by its current stored direction
   * `(currentSourceSgSystemId → currentDestSgSystemId)`; after this call
   * the pair reads as `(currentDestSgSystemId → currentSourceSgSystemId)`
   * for this UC only. Other UCs that reference the same unordered SG pair
   * are unaffected — each needs its own call if applicable.
   *
   * Emitted by Phase 11 for FR-STATUS-04 Step 1 direction correction: the
   * Disconnected UC's pair was originally control-link-derived (arbitrary
   * direction per FR-UC-01 step 4's smaller-SG-ID rule); a data-link has
   * appeared in the opposite direction; the data-link's direction is
   * authoritative.
   */
  reverseSgPairDirection(
    ucSystemId: number,
    currentSourceSgSystemId: number,
    currentDestSgSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
}
