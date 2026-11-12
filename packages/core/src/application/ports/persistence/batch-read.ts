/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  EntityRef,
  IdentityFor,
} from '../../../domain/identity/entity-identity.js';
import type {IssueEntityType} from '../../../shared/issues/impacted-entity.js';

/**
 * Why a requested entity could not be loaded by a batch read.
 *
 * - `NOT_FOUND`: a requested systemId does not exist in the file.
 * - `UNRESOLVED_REFERENCE`: the entity exists but a part it references
 *   (for example an SGKV value definition) is missing. Scoped reads such
 *   as "all in a file" can only produce this reason.
 */
export const FAILED_ENTITY_REASON = {
  NotFound: 'NOT_FOUND',
  UnresolvedReference: 'UNRESOLVED_REFERENCE',
} as const;
export type FailedEntityReason =
  (typeof FAILED_ENTITY_REASON)[keyof typeof FAILED_ENTITY_REASON];

/** One entity a batch read could not load. */
export interface FailedEntity<E extends IssueEntityType = IssueEntityType> {
  readonly systemId: number;
  readonly reason: FailedEntityReason;
  /**
   * The entity's own natural identity, when the adapter has it even though
   * the entity could not be loaded (for example a subgraph's name and
   * natural ID when one of its SGKVs is unresolved). Missing for
   * `NOT_FOUND`, and when the identity itself depends on the missing part.
   */
  readonly identity?: IdentityFor<E>;
  /** For `UNRESOLVED_REFERENCE`: the referenced entity that is missing. */
  readonly missingRef?: EntityRef;
}

/**
 * Result of a persistence batch read.
 *
 * Each entity is either fully loaded into `items` or listed in `failed`;
 * one failure never affects the other entities. Infrastructure errors are
 * thrown, never reported here. `E` is the entity type of the items; it
 * types the identity carried by `failed`.
 */
export interface BatchRead<T, E extends IssueEntityType = IssueEntityType> {
  readonly items: T[];
  readonly failed: FailedEntity<E>[];
}
