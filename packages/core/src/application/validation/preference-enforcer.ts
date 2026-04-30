/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueCategory,
  SEVERITY_ORDER,
  deriveCategoryFromSeverity,
} from '../../domain/validation/issue.js';
import type {ValidationIssue} from '../../domain/validation/issue.js';
import {buildSuppressionKey} from '../../domain/validation/validation-preferences.js';
import type {ValidationPreferences} from '../../domain/validation/validation-preferences.js';

/**
 * Applies user preferences to a raw issue produced by a rule.
 *
 * Order of checks:
 * 1. DATA_LOSS issues — always returned as-is (cannot be suppressed or disabled)
 * 2. Fast path — if no code override AND no instance suppression, return as-is
 * 3. Apply severity override first (once) to determine effective severity/category
 * 4. BLOCKING (original or escalated) — return with new severity; cannot suppress/disable
 * 5. NON_BLOCKING — check instance suppression, then global disable
 *
 * Returns null if the issue should be hidden from the report.
 */
export function applyPreferences(
  issue: ValidationIssue,
  preferences: ValidationPreferences,
): ValidationIssue | null {
  // 1. DATA_LOSS: always shown, no preferences apply
  if (issue.category === IssueCategory.DataLoss) return issue;

  // 2. Fast path: no code override and no instance suppression for this entity
  const pref = preferences.overrides[issue.code];
  const suppressionKey = buildSuppressionKey(
    issue.code,
    issue.impactedEntity.entityType,
    issue.impactedEntity.systemId,
  );
  if (!pref && !preferences.suppressions?.[suppressionKey]) return issue;

  // 3. Apply severity override once to determine effective severity/category
  let effectiveSeverity = issue.defaultSeverity;
  let effectiveCategory: IssueCategory = issue.category;

  if (pref?.severityOverride) {
    const defaultIdx = SEVERITY_ORDER.indexOf(issue.defaultSeverity);
    const overrideIdx = SEVERITY_ORDER.indexOf(pref.severityOverride);
    if (overrideIdx > defaultIdx) {
      effectiveSeverity = pref.severityOverride;
      effectiveCategory = deriveCategoryFromSeverity(effectiveSeverity);
    }
  }

  // 4. BLOCKING (original or escalated via severity override): cannot suppress or disable
  if (effectiveCategory === IssueCategory.Blocking) {
    return effectiveSeverity === issue.defaultSeverity
      ? issue
      : {...issue, effectiveSeverity, category: effectiveCategory};
  }

  // 5. NON_BLOCKING: check instance suppression then global disable
  if (preferences.suppressions?.[suppressionKey]) return null;
  if (pref?.disabled) return null;

  // Return with effective severity/category (may be unchanged)
  return effectiveSeverity === issue.defaultSeverity
    ? issue
    : {...issue, effectiveSeverity, category: effectiveCategory};
}
