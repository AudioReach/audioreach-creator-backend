/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LegacyIssue} from '../../../../shared/issues/index.js';

/**
 * Result of building entities with issue collection.
 *
 * `issues` is a flat list of base `LegacyIssue`s (ValidationIssue is structurally
 * assignable to LegacyIssue, so validation-shaped entries flow through without
 * translation). Downstream consumers hand this straight to `Result.partial(data, issues)`.
 */
export interface BuildResult<T> {
  entities: T[];
  issues: LegacyIssue[];
}

/**
 * Thin `LegacyIssue[]` accumulator used across the upload pipeline.
 *
 * Callers construct concrete Issues via:
 *   - `newInsertFailureIssue(...)` in `domain/validation/insert-failures/` (DATA_LOSS)
 *   - direct object literals for validation rule outputs (ValidationIssue extends LegacyIssue)
 *
 * `formatForApi()` from the pre-refactor collector is removed — the collector
 * output is consumed by `Result.partial(data, collector.getIssues())` and the API
 * mapper does the wire-format projection.
 */
export class IssueCollector {
  private issues: LegacyIssue[] = [];

  addIssue(issue: LegacyIssue): void {
    this.issues.push(issue);
  }

  addIssues(issues: readonly LegacyIssue[]): void {
    this.issues.push(...issues);
  }

  getIssues(): readonly LegacyIssue[] {
    return [...this.issues];
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  getIssueCount(): number {
    return this.issues.length;
  }

  clear(): void {
    this.issues = [];
  }
}
