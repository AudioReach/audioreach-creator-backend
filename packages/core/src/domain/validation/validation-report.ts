/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IssueCategory} from './issue.js';
import type {IssueSeverity, ValidationIssue} from './issue.js';

export interface ValidationSummary {
  total: number;
  bySeverity: Record<IssueSeverity, number>; // counts by effective severity
  blocking: number;
  nonBlocking: number;
  dataLoss: number; // count of DATA_LOSS category issues
}

export class ValidationReport {
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly blockedSave: boolean;
  readonly summary: ValidationSummary;

  constructor(issues: ValidationIssue[]) {
    this.issues = issues;
    this.blockedSave = issues.some(i => i.category === IssueCategory.Blocking);
    this.summary = this.buildSummary(issues);
  }

  private buildSummary(issues: ValidationIssue[]): ValidationSummary {
    const bySeverity: Record<IssueSeverity, number> = {
      FATAL: 0,
      ERROR: 0,
      WARNING: 0,
    };
    let blocking = 0;
    let nonBlocking = 0;
    let dataLoss = 0;
    for (const issue of issues) {
      bySeverity[issue.effectiveSeverity]++;
      if (issue.category === IssueCategory.Blocking) blocking++;
      else if (issue.category === IssueCategory.DataLoss) dataLoss++;
      else nonBlocking++;
    }
    return {total: issues.length, bySeverity, blocking, nonBlocking, dataLoss};
  }
}
