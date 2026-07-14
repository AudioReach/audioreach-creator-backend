/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationReport} from '../../domain/validation/validation-report.js';
import type {
  ValidationRule,
  ValidationRuleGroup,
} from '../../domain/validation/validation-rule.js';
import type {FileValidationContext} from '../../domain/validation/validation-context.js';
import type {IssueEntityType} from '../../shared/issues/index.js';
import type {ValidationIssue} from '../../domain/validation/issue.js';
import {applyPreferences} from './preference-enforcer.js';

/**
 * Runs all applicable validation rules against the provided context,
 * applies user preferences to each issue, and returns a ValidationReport.
 *
 * Rules are stored as ValidationRule<FileValidationContext> — safe because
 * FileValidationContext extends all context profiles, so any profile-typed
 * rule is assignable here.
 */
export class ValidationEngine {
  constructor(
    private readonly rules: ReadonlyArray<
      ValidationRule<FileValidationContext>
    >,
  ) {}

  /**
   * Returns the union of requiredEntityTypes across all rules in the given group.
   * Pass this to ValidationContextBuilder.fromDb() to load only the needed DB tables.
   */
  getRequiredEntityTypes(group: ValidationRuleGroup): Set<IssueEntityType> {
    return new Set(
      this.rules
        .filter(r => r.groups.includes(group))
        .flatMap(r => [...r.requiredEntityTypes]),
    );
  }

  run(
    context: FileValidationContext,
    group: ValidationRuleGroup,
  ): ValidationReport {
    const applicableRules = this.rules.filter(r => r.groups.includes(group));
    const issues: ValidationIssue[] = [];

    for (const rule of applicableRules) {
      const ruleIssues = rule.validate(context);
      for (const issue of ruleIssues) {
        const resolved = applyPreferences(issue, context.preferences);
        if (resolved !== null) {
          issues.push(resolved);
        }
      }
    }

    return new ValidationReport(issues);
  }
}
