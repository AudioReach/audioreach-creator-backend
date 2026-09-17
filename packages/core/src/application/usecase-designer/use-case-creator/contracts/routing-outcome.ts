/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import type {UsecaseChangeDescriptor} from './routing-state.js';

export type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

export interface RoutingOutcome {
  readonly emittedChanges: readonly UsecaseChangeDescriptor[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}

export function createEmptyRoutingOutcome(
  groupId: string,
  emittedChanges: readonly UsecaseChangeDescriptor[] = [],
  issues: readonly Issue[] = [],
): RoutingOutcome {
  return {emittedChanges: [...emittedChanges], issues: [...issues], groupId};
}
