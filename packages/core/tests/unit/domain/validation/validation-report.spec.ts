/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationReport} from '../../../../src/domain/validation/validation-report.js';
import {
  IssueCategory,
  IssueSeverity,
} from '../../../../src/domain/validation/issue.js';
import type {ValidationIssue} from '../../../../src/domain/validation/issue.js';

function makeIssue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    code: 'ARC-TEST-001',
    name: 'Test Issue',
    description: 'A test issue',
    defaultSeverity: IssueSeverity.Warning,
    effectiveSeverity: IssueSeverity.Warning,
    category: IssueCategory.NonBlocking,
    fixOptions: [],
    impactedEntity: {entityType: 'SpfModule', systemId: 1},
    impactedUsecases: [],
    ...overrides,
  };
}

describe('ValidationReport', () => {
  it('should have blockedSave=false when no BLOCKING issues', () => {
    const report = new ValidationReport([makeIssue()]);
    expect(report.blockedSave).toBe(false);
  });

  it('should have blockedSave=true when any BLOCKING issue exists', () => {
    const blockingIssue = makeIssue({
      effectiveSeverity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
    });
    const report = new ValidationReport([blockingIssue]);
    expect(report.blockedSave).toBe(true);
  });

  it('should count issues by severity in summary', () => {
    const issues = [
      makeIssue({
        effectiveSeverity: IssueSeverity.Error,
        category: IssueCategory.Blocking,
      }),
      makeIssue({effectiveSeverity: IssueSeverity.Warning}),
      makeIssue({effectiveSeverity: IssueSeverity.Warning}),
    ];
    const report = new ValidationReport(issues);
    expect(report.summary.total).toBe(3);
    expect(report.summary.bySeverity.ERROR).toBe(1);
    expect(report.summary.bySeverity.WARNING).toBe(2);
    expect(report.summary.blocking).toBe(1);
    expect(report.summary.nonBlocking).toBe(2);
    expect(report.summary.dataLoss).toBe(0);
  });

  it('should count DATA_LOSS issues separately from nonBlocking', () => {
    const issues = [
      makeIssue({category: IssueCategory.NonBlocking}),
      makeIssue({
        category: IssueCategory.DataLoss,
        effectiveSeverity: IssueSeverity.Warning,
      }),
      makeIssue({
        category: IssueCategory.DataLoss,
        effectiveSeverity: IssueSeverity.Warning,
      }),
    ];
    const report = new ValidationReport(issues);
    expect(report.summary.nonBlocking).toBe(1);
    expect(report.summary.dataLoss).toBe(2);
    expect(report.blockedSave).toBe(false);
  });

  it('should return empty report for no issues', () => {
    const report = new ValidationReport([]);
    expect(report.blockedSave).toBe(false);
    expect(report.summary.total).toBe(0);
    expect(report.summary.dataLoss).toBe(0);
  });

  it('should expose issues as readonly array', () => {
    const issue = makeIssue();
    const report = new ValidationReport([issue]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toBe(issue);
  });

  it('should count FATAL issues as blocking', () => {
    const fatalIssue = makeIssue({
      effectiveSeverity: IssueSeverity.Fatal,
      category: IssueCategory.Blocking,
    });
    const report = new ValidationReport([fatalIssue]);
    expect(report.blockedSave).toBe(true);
    expect(report.summary.bySeverity.FATAL).toBe(1);
    expect(report.summary.blocking).toBe(1);
  });
});
