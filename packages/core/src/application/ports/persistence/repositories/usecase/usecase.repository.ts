/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import {CHANGE_OPERATION} from '../../../../shared/change-vocabulary.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseType} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../shared/links-for-pair.js';
export type {ReadMode, ReadOptions} from '../shared/read-options.js';
export {READ_MODE} from '../shared/read-options.js';
import type {UseCaseQueryService} from '../../query-services/usecase/usecase-query-service.js';

/**
 * Components referenced by a manual UseCase edit. Stored with the edit so
 * validation can confirm that each SG and link still exists.
 *
 * Auto-routing edits omit this payload.
 */
export interface ReferencedComponents {
  readonly sgSystemIds: readonly number[];
  readonly dataLinkSystemIds: readonly number[];
  readonly controlLinkSystemIds: readonly number[];
}

/**
 * Content-only SGKV additions required by a routing edit. Retained on the
 * root UseCase edit payload for commit processing; not complete UseCase state.
 */
export interface UsecaseSgkvAssignment {
  readonly subgraphSystemId: number;
  readonly valueDefinitionSystemIds: readonly number[];
}

export interface ActiveManualUsecaseEdit {
  readonly changeId: number;
  readonly usecase: UseCase | null;
  readonly operation:
    | typeof CHANGE_OPERATION.Create
    | typeof CHANGE_OPERATION.Update;
  readonly referencedComponents: ReferencedComponents | null;
}

/**
 * Compact reference to the canonical UseCase-level edit action emitted by a
 * write. `null` is returned when no edit action is emitted, such as a
 * structural no-op or a write deferred through the pending-change cache.
 */
export interface UsecaseChangeRef {
  readonly systemId: number;
  readonly changeId: number;
}

/**
 * Structural delta applied atomically to a UseCase by
 * `applyStructuralChange`. All fields optional; the adapter emits a group of
 * current-state edit actions reflecting the union of changes.
 *
 * Used to extend, trim, rebuild, or otherwise update a UseCase structure.
 */
export interface StructuralDelta {
  addedSgSystemIds?: readonly number[];
  removedSgSystemIds?: readonly number[];
  addedPairs?: readonly SubgraphPair[];
  removedPairs?: readonly SubgraphPair[];
  /**
   * Replacement type. Omit when the structural change does not affect type.
   */
  newType?: UsecaseType;
  /**
   * If true, cancel any pending `DELETE UseCase` edit for this UC.
   */
  cancelPendingDelete?: boolean;
}

/**
 * `UseCase` writes, plus the reads that only commands need.
 *
 * Inherits every `UseCaseQueryService` read so commands run them inside
 * their own transaction and see their uncommitted writes.
 */
export interface UsecaseRepository extends UseCaseQueryService {
  removeSubgraphReferences(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<{affectedUseCaseSystemIds: number[]}>;

  /**
   * Returns UCs that are the target of at least one current MANUAL edit action
   * on this file — i.e., an `edit_actions` row with
   * `target_table='UseCase'` and `source='MANUAL'`.
   *
   * Each result retains the edit ID, operation, effective UseCase (or null),
   * and referenced component payload (or null) for dependency validation.
   *
   * No `change_status` filter is applied: source identifies user-authored
   * edits regardless of their staging state.
   * Not affected by `readMode` — this query is inherently about
   * `edit_actions` state, not overlay-vs-committed base rows.
   */
  findActiveManualUseCaseEdits(
    fileSystemId: number,
  ): Promise<ActiveManualUsecaseEdit[]>;

  /**
   * Creates a UseCase. Emits a CREATE `edit_actions` row for the base
   * `UseCase` row plus one CREATE per element of `uc.subgraphSystemIds`
   * (in `UseCaseSubgraph`) and per `uc.subgraphPairs` element (in
   * `UseCaseSubgraphPair`). The ambient groupId is response correlation only
   * and is not persisted on these rows.
   *
   * When provided, routing SGKV additions and `referencedComponents` are
   * merged into the base CREATE payload.
   */
  create(
    uc: UseCase,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
    sgkvAssignments?: readonly UsecaseSgkvAssignment[],
  ): Promise<UsecaseChangeRef | null>;

  /**
   * Soft-deletes a UseCase by emitting a DELETE `edit_actions` row on the
   * base `UseCase` row. Junction rows (`use_case_subgraphs`,
   * `use_case_subgraph_pairs`) cascade at the physical layer on flush.
   */
  delete(
    ucSystemId: number,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null>;

  /**
   * Applies a routing-shaped structural delta to `uc`. Emits one ordered set
   * of current-state `edit_actions`, covering
   * (in the following order):
   *   1. optional `cancelPendingDelete` (removes any pending
   *      `DELETE UseCase` edit for this UC).
   *   2. `removedPairs` → per-pair DELETE on `UseCaseSubgraphPair`.
   *   3. `removedSgSystemIds` → per-SG DELETE on `UseCaseSubgraph`.
   *   4. `addedSgSystemIds` → per-SG CREATE on `UseCaseSubgraph`.
   *   5. `addedPairs` → per-pair CREATE on `UseCaseSubgraphPair`.
   *   6. optional `newType` → base-row UPDATE on `UseCase`.
   *
   * When routing SGKV additions or `referencedComponents` are provided, they
   * are merged into the base-row UPDATE's `new_value` (creating one if
   * `newType` is absent — the row exists solely to carry the payload).
   */
  applyStructuralChange(
    ucSystemId: number,
    delta: StructuralDelta,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
    sgkvAssignments?: readonly UsecaseSgkvAssignment[],
  ): Promise<UsecaseChangeRef | null>;

  /**
   * Type-only mutation. Emits a single UPDATE delta on the `UseCase` row
   * setting `type`. Use `applyStructuralChange` when SG or pair mutations
   * accompany the type change.
   */
  changeType(
    ucSystemId: number,
    newType: UsecaseType,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null>;

  /**
   * Reverses the stored direction of a specific pair inside `uc`.
   *
   * Identifies the pair by its current stored direction
   * `(currentSourceSgSystemId → currentDestSgSystemId)`; after this call
   * the pair reads as `(currentDestSgSystemId → currentSourceSgSystemId)`
   * for this UC only. Other UCs that reference the same unordered SG pair
   * are unaffected — each needs its own call if applicable.
   *
   * Used when a data-link establishes the opposite direction for a pair that
   * previously used an arbitrary control-link-derived direction.
   */
  reverseSgPairDirection(
    ucSystemId: number,
    currentSourceSgSystemId: number,
    currentDestSgSystemId: number,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null>;
}
