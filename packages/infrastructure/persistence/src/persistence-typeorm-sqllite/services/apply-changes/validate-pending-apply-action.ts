/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException, RESULT_KIND} from '@arc/core';
import type {PendingApplyAction} from './apply-changes.types.js';
import {ApplyIssueFactory} from './apply-issues.js';
import {createDefaultApplyReductionRegistry} from './apply-target-registry.js';

const reductionRegistry = createDefaultApplyReductionRegistry();

/**
 * Validates the persisted action shape with the same target rule used by apply.
 * Writers call this before superseding rows, caching actions, or inserting data.
 */
export function validatePendingApplyAction(action: PendingApplyAction): void {
  const rule = reductionRegistry.get(action.entityName);
  if (rule === undefined) {
    throw new DomainRuleViolationException([
      ApplyIssueFactory.unsupportedTarget(action.entityName),
    ]);
  }
  const result = rule.reduceToMainTableWriteOperations([action]);
  if (result.kind === RESULT_KIND.Fail) {
    throw new DomainRuleViolationException(result.issues);
  }
}
