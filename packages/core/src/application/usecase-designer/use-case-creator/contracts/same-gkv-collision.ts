/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingCombination} from './routing-state.js';

export const COLLISION_RESOLUTION_MODE = {
  PathA: 'PATH_A',
  PathB: 'PATH_B',
  Merge: 'MERGE',
  KeepExisting: 'KEEP_EXISTING',
  ReplaceWithNew: 'REPLACE_WITH_NEW',
} as const;

export type CollisionResolutionMode =
  (typeof COLLISION_RESOLUTION_MODE)[keyof typeof COLLISION_RESOLUTION_MODE];

export const COLLISION_OPERAND_KIND = {
  New: 'NEW',
  Existing: 'EXISTING',
} as const;

/** A topology proposed by the current routing pass but not yet persisted. */
export interface NewCollisionOperand {
  readonly kind: typeof COLLISION_OPERAND_KIND.New;
  readonly candidate: RoutingCombination;
}

/** A committed UseCase whose GKV conflicts with a proposed topology. */
export interface ExistingCollisionOperand {
  readonly kind: typeof COLLISION_OPERAND_KIND.Existing;
  readonly usecase: UseCase;
}

export type SameGkvCollisionOperand =
  | NewCollisionOperand
  | ExistingCollisionOperand;

/**
 * The two topologies competing for the same GKV.
 * NEW/NEW operands are canonically ordered so Path A and Path B remain stable;
 * NEW/EXISTING operands keep the proposed topology first.
 */
export interface SameGkvCollision {
  readonly collisionId: string;
  readonly gkvValueSystemIds: readonly number[];
  readonly operands: readonly [
    SameGkvCollisionOperand,
    SameGkvCollisionOperand,
  ];
  readonly options: readonly CollisionResolutionMode[];
}

export interface CollisionResolutionSelection {
  readonly mode: CollisionResolutionMode;
  readonly collisionId: string;
}
