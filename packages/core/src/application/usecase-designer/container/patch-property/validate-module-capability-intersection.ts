/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleForContainer} from '../../../ports/persistence/repositories/module/module.repository.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';

/**
 * For each module in `modules`, checks whether `containerTypeIds ∩ capabilityIds`
 * is non-empty. Throws `DomainRuleViolationException` with one issue per failing
 * module (using the module's `displayName`).
 *
 * Called before the write transaction for property 0x08001011 (capability list).
 */
export function validateModuleCapabilityIntersection(
  modules: ModuleForContainer[],
  capabilityIds: number[],
): void {
  const capSet = new Set(capabilityIds);

  const failingIssues = modules
    .filter(mod => !mod.containerTypeIds.some(id => capSet.has(id)))
    .map(mod => IssueFactory.containerCapabilityMismatch(mod.displayName));

  if (failingIssues.length > 0) {
    throw new DomainRuleViolationException(
      failingIssues,
      'Module capability and container capability do not match for one or more modules; see issues for details.',
    );
  }
}
