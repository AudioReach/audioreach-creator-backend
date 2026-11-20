/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../issues/issue.js';
import type {UsecaseChangeDescriptor} from './routing-state.js';
import type {UsecaseChangeDetails} from '../../../ports/persistence/query-services/usecase/query-models/usecase-change-details-read-model.js';

export type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

/** What the routing engine produced; its warnings travel on the Result. */
export interface RoutingOutcome {
  readonly emittedChanges: readonly UsecaseChangeDescriptor[];
  readonly groupId: string;
}

/**
 * What the routing commands return: the committed-versus-session snapshot
 * of every emitted change, read inside the same transaction, and the
 * rendered routing warnings.
 */
export interface RoutingCommandOutcome {
  readonly changes: readonly UsecaseChangeDetails[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}

export function createEmptyRoutingOutcome(
  groupId: string,
  emittedChanges: readonly UsecaseChangeDescriptor[] = [],
): RoutingOutcome {
  return {emittedChanges: [...emittedChanges], groupId};
}
