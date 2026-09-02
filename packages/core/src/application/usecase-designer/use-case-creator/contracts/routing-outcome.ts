/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

export type {UsecaseChangeRef} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

export interface RoutingOutcome {
  readonly created: readonly UsecaseChangeRef[];
  readonly updated: readonly UsecaseChangeRef[];
  readonly markedForDeletion: readonly UsecaseChangeRef[];
  readonly issues: readonly Issue[];
  readonly groupId: string;
}

export function createEmptyRoutingOutcome(
  groupId: string,
  issues: readonly Issue[] = [],
): RoutingOutcome {
  return {
    created: [],
    updated: [],
    markedForDeletion: [],
    issues: [...issues],
    groupId,
  };
}
