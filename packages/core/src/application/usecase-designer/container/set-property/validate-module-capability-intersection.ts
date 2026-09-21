/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';

/**
 * For each module in `modules`, checks whether `containerTypeIds ∩ capabilityIds`
 * is non-empty. Throws `DomainRuleViolationException` with one detail issue per
 * failing module.
 *
 * Called before the write transaction for property 0x08001011 (capability list).
 */
export function validateModuleCapabilityIntersection(
  modules: SpfModuleDefinition[],
  capabilityIds: number[],
): void {
  const capSet = new Set(capabilityIds);

  const failingModules = modules.filter(mod =>
    [...mod.containerTypesSystemIds].every(id => !capSet.has(id)),
  );

  if (failingModules.length > 0) {
    const issues: Issue[] = failingModules.map(mod => ({
      code: 'DOMAIN_RULE_VIOLATION',
      message:
        `Module '${mod.displayName}' does not support any of the selected capability IDs. ` +
        `The module's allowed container types do not intersect with the requested capability list.`,
      severity: IssueSeverity.Error,
    }));

    throw new DomainRuleViolationException(
      issues,
      'Module capability and container capability do not match for one or more modules; see issues for details.',
    );
  }
}
