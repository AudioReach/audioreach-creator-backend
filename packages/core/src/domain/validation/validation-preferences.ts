/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueSeverity} from './issue.js';

export interface IssuePreference {
  /**
   * Override the default severity. Only upward escalation is allowed
   * (e.g., WARNING → ERROR). Downgrading is not permitted in the current phase.
   * Future: a per-rule `canDowngrade` flag will unlock this when needed.
   */
  severityOverride?: IssueSeverity;

  /**
   * Disable ALL instances of this issue code globally.
   * Only honoured for NON_BLOCKING issues.
   * BLOCKING and DATA_LOSS issues cannot be disabled.
   */
  disabled?: boolean;
}

/**
 * Instance-level suppression: suppress a specific occurrence of an issue
 * for a specific entity, without disabling the rule globally.
 *
 * Use case: "single port has multiple links" is a WARNING, but for
 * non-concurrent usecases this is expected — the user can suppress
 * this specific instance while keeping the rule active for others.
 *
 * Only valid for NON_BLOCKING issues.
 * BLOCKING and DATA_LOSS issues cannot be suppressed.
 * DATA_LOSS issues are resolved via fix options or acknowledged via the
 * acknowledge-data-loss endpoint.
 */
export interface IssueSuppression {
  reason?: string; // Optional user note explaining why this instance is acceptable
}

export interface ValidationPreferences {
  // Global overrides by issue code — affects all instances of a rule
  overrides: Record<string, IssuePreference>;

  /**
   * Instance-level suppressions.
   * Key format: "${code}:${entityType}:${systemId}"
   * Example: "ARC-LINK-002:DataLink:8388625"
   *
   * Only valid for NON_BLOCKING issues.
   * BLOCKING and DATA_LOSS issues cannot be suppressed at the instance level.
   *
   * Lifecycle: when an entity is deleted, its suppression becomes dead
   * (no issue will be generated for a non-existent entity). Dead suppressions
   * are cleaned up lazily when saving preferences.
   */
  suppressions: Record<string, IssueSuppression>;
}

export const EMPTY_PREFERENCES: ValidationPreferences = {
  overrides: {},
  suppressions: {},
};

/** Build the suppression key for a specific issue instance. */
export function buildSuppressionKey(
  code: string,
  entityType: string,
  systemId: number,
): string {
  return `${code}:${entityType}:${systemId}`;
}
