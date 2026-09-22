/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../shared/issues/factories.js';
import type {
  ApplyDependencyResolver,
  ApplyRule,
  ApplyRuleSlots,
} from './apply-changes.types.js';
import {SystemIdApplyRule} from './system-id-apply-rule.js';

export type GenericApplyRuleRegistration = {
  targetType: string;
  slots: ApplyRuleSlots;
  dependencies?: ApplyDependencyResolver;
  sanitizeValues?: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
};

export class ApplyRuleRegistry {
  private readonly rules = new Map<string, ApplyRule>();

  constructor(
    genericTargets: readonly GenericApplyRuleRegistration[],
    specialRules: readonly ApplyRule[],
  ) {
    for (const registration of genericTargets) {
      this.addRule(new SystemIdApplyRule(registration));
    }
    for (const rule of specialRules) this.addRule(rule);
  }

  getRule(targetType: string): ApplyRule {
    const rule = this.rules.get(targetType);
    if (rule === undefined) {
      throw new DomainRuleViolationException([
        IssueFactory.unsupportedApplyTarget(targetType),
      ]);
    }
    return rule;
  }

  private addRule(rule: ApplyRule): void {
    if (this.rules.has(rule.targetType)) {
      throw new Error(`Duplicate apply rule registration: ${rule.targetType}`);
    }
    this.rules.set(rule.targetType, rule);
  }
}

