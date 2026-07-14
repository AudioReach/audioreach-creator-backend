/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/index.js';

/**
 * Result of building entities with issue collection.
 *
 * `issues` is a flat list of base `Issue`s (ValidationIssue is structurally
 * assignable to Issue, so validation-shaped entries flow through without
 * translation). Downstream consumers hand this straight to `Result.partial(data, issues)`.
 */
export interface BuildResult<T> {
  entities: T[];
  issues: Issue[];
}

/**
 * Thin `Issue[]` accumulator used across the upload pipeline.
 *
 * Callers construct concrete Issues via:
 *   - `newInsertFailureIssue(...)` in `domain/validation/insert-failures/` (DATA_LOSS)
 *   - direct object literals for validation rule outputs (ValidationIssue extends Issue)
 *
 * `formatForApi()` from the pre-refactor collector is removed — the collector
 * output is consumed by `Result.partial(data, collector.getIssues())` and the API
 * mapper does the wire-format projection.
 */
export class IssueCollector {
  private issues: Issue[] = [];

  addIssue(issue: Issue): void {
    this.issues.push(issue);
  }

  addIssues(issues: readonly Issue[]): void {
    this.issues.push(...issues);
  }

  getIssues(): readonly Issue[] {
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
