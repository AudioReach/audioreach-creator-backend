/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DomainRuleViolationException,
  RESULT_KIND,
  type PendingApplyAction,
} from '@arc/core';
import {createDefaultApplyRuleRegistry} from './apply-target-registry.js';

const ruleRegistry = createDefaultApplyRuleRegistry();

/**
 * Validates the persisted action shape with the same target rule used by apply.
 * Writers call this before superseding rows, caching actions, or inserting data.
 */
export function validatePendingApplyAction(action: PendingApplyAction): void {
  const result = ruleRegistry.getRule(action.targetType).reduce([action]);
  if (result.kind === RESULT_KIND.Fail) {
    throw new DomainRuleViolationException(result.issues);
  }
}
