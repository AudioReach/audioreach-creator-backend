/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutedUsecaseCandidate} from './routing-state.js';

export const COLLISION_RESOLUTION_MODE = {
  SelectCandidate: 'SELECT_CANDIDATE',
  KeepExisting: 'KEEP_EXISTING',
  MergeAll: 'MERGE_ALL',
} as const;

export type CollisionResolutionMode =
  (typeof COLLISION_RESOLUTION_MODE)[keyof typeof COLLISION_RESOLUTION_MODE];

export const COLLISION_ALTERNATIVE_KIND = {
  New: 'NEW',
  Existing: 'EXISTING',
} as const;

/** A topology proposed by the current routing pass but not yet persisted. */
export interface NewCollisionAlternative {
  readonly alternativeId: string;
  readonly kind: typeof COLLISION_ALTERNATIVE_KIND.New;
  readonly candidate: RoutedUsecaseCandidate;
}

/** A committed UseCase whose GKV conflicts with a proposed topology. */
export interface ExistingCollisionAlternative {
  readonly alternativeId: string;
  readonly kind: typeof COLLISION_ALTERNATIVE_KIND.Existing;
  readonly usecase: UseCase;
}

export type SameGkvCollisionAlternative =
  | NewCollisionAlternative
  | ExistingCollisionAlternative;

/**
 * Every distinct topology competing to become the one UseCase of record for a GKV.
 */
export interface SameGkvCollisionGroup {
  readonly collisionId: string;
  readonly gkvValueSystemIds: readonly number[];
  readonly alternatives: readonly SameGkvCollisionAlternative[];
}

export type CollisionResolutionSelection =
  | {
      readonly collisionId: string;
      readonly mode: typeof COLLISION_RESOLUTION_MODE.SelectCandidate;
      readonly alternativeId: string;
    }
  | {
      readonly collisionId: string;
      readonly mode:
        | typeof COLLISION_RESOLUTION_MODE.KeepExisting
        | typeof COLLISION_RESOLUTION_MODE.MergeAll;
    };
