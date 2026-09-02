/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  type ChangeOperation,
} from '../../../shared/change-vocabulary.js';
import type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

export interface KvResolution {
  readonly sgSystemId: number;
  readonly sgkvSystemId: number;
  readonly valueSystemIds: readonly number[];
}

export interface RoutingSeed {
  readonly subgraphSystemId: number;
}

export interface RoutingCone {
  readonly seedSubgraphSystemId: number;
  readonly subgraphSystemIds: readonly number[];
}

export interface DfsPath {
  readonly subgraphSystemIds: readonly number[];
}

export interface RoutingCombination {
  readonly subgraphSystemIds: readonly number[];
  readonly valueSystemIds: readonly number[];
}

export interface ClassifiedUsecase {
  readonly systemId: number;
  readonly action: ChangeOperation;
}

export const ORPHAN_KIND = {
  Subgraph: 'SUBGRAPH',
  Subsystem: 'SUBSYSTEM',
  DataLink: 'DATA_LINK',
  ControlLink: 'CONTROL_LINK',
} as const;

export type OrphanKind = (typeof ORPHAN_KIND)[keyof typeof ORPHAN_KIND];

export interface OrphanCandidate {
  readonly systemId: number;
  readonly kind: OrphanKind;
}

/** Internal write result retained until ResponseBuilder groups it by operation. */
export interface EmittedUsecaseChange extends UsecaseChangeRef {
  readonly operation: Exclude<
    ChangeOperation,
    typeof CHANGE_OPERATION.None
  >;
}
