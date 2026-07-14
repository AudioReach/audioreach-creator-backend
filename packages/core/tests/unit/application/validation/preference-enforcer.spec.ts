/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {applyPreferences} from '../../../../src/application/validation/preference-enforcer.js';
import {
  IssueCategory,
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../src/shared/issues/index.js';
import {
  EMPTY_PREFERENCES,
  buildSuppressionKey,
} from '../../../../src/domain/validation/validation-preferences.js';
import type {ValidationIssue} from '../../../../src/domain/validation/issue.js';
import type {ValidationPreferences} from '../../../../src/domain/validation/validation-preferences.js';

function makeIssue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    code: 'ARC-TEST-001',
    name: 'Test',
    message: 'Test',
    defaultSeverity: IssueSeverity.Warning,
    severity: IssueSeverity.Warning,
    category: IssueCategory.NonBlocking,
    fixOptions: [],
    impactedEntity: {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: 1},
    impactedUsecases: [],
    ...overrides,
  };
}

describe('applyPreferences', () => {
  it('should return issue unchanged when no override exists (fast path)', () => {
    const issue = makeIssue();
    const result = applyPreferences(issue, EMPTY_PREFERENCES);
    expect(result).toBe(issue); // same reference — not a copy
  });

  it('should return DATA_LOSS issue unchanged regardless of preferences', () => {
    const issue = makeIssue({category: IssueCategory.DataLoss});
    const prefs: ValidationPreferences = {
      overrides: {'ARC-TEST-001': {disabled: true}},
      suppressions: {},
    };
    const result = applyPreferences(issue, prefs);
    expect(result).toBe(issue); // DATA_LOSS always returned as-is
  });

  it('should return null when NON_BLOCKING issue is disabled globally', () => {
    const issue = makeIssue();
    const prefs: ValidationPreferences = {
      overrides: {'ARC-TEST-001': {disabled: true}},
      suppressions: {},
    };
    expect(applyPreferences(issue, prefs)).toBeNull();
  });

  it('should NOT disable a BLOCKING issue', () => {
    const issue = makeIssue({
      defaultSeverity: IssueSeverity.Error,
      severity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
    });
    const prefs: ValidationPreferences = {
      overrides: {'ARC-TEST-001': {disabled: true}},
      suppressions: {},
    };
    expect(applyPreferences(issue, prefs)).not.toBeNull();
  });

  it('should escalate severity when override is strictly higher', () => {
    const issue = makeIssue({
      defaultSeverity: IssueSeverity.Warning,
      severity: IssueSeverity.Warning,
    });
    const prefs: ValidationPreferences = {
      overrides: {'ARC-TEST-001': {severityOverride: IssueSeverity.Error}},
      suppressions: {},
    };
    const result = applyPreferences(issue, prefs);
    expect(result?.severity).toBe(IssueSeverity.Error);
    expect(result?.category).toBe(IssueCategory.Blocking);
  });

  it('should silently ignore downgrade attempt', () => {
    const issue = makeIssue({
      defaultSeverity: IssueSeverity.Error,
      severity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
    });
    const prefs: ValidationPreferences = {
      overrides: {'ARC-TEST-001': {severityOverride: IssueSeverity.Warning}},
      suppressions: {},
    };
    const result = applyPreferences(issue, prefs);
    expect(result?.severity).toBe(IssueSeverity.Error); // unchanged
    expect(result?.category).toBe(IssueCategory.Blocking);
  });

  it('should suppress a specific NON_BLOCKING issue instance', () => {
    const issue = makeIssue({
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.DataLink,
        systemId: 8388625,
      },
    });
    const key = buildSuppressionKey(
      'ARC-TEST-001',
      ISSUE_ENTITY_TYPE.DataLink,
      8388625,
    );
    const prefs: ValidationPreferences = {
      overrides: {},
      suppressions: {[key]: {reason: 'Expected for non-concurrent usecases'}},
    };
    expect(applyPreferences(issue, prefs)).toBeNull();
  });

  it('should NOT suppress a BLOCKING issue instance', () => {
    const issue = makeIssue({
      defaultSeverity: IssueSeverity.Error,
      severity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId: 1,
      },
    });
    const key = buildSuppressionKey(
      'ARC-TEST-001',
      ISSUE_ENTITY_TYPE.SpfModule,
      1,
    );
    const prefs: ValidationPreferences = {
      overrides: {},
      suppressions: {[key]: {}},
    };
    expect(applyPreferences(issue, prefs)).not.toBeNull();
  });

  it('should return issue as-is when escalated to BLOCKING (cannot suppress/disable)', () => {
    const issue = makeIssue({
      defaultSeverity: IssueSeverity.Warning,
      severity: IssueSeverity.Warning,
      category: IssueCategory.NonBlocking,
    });
    const key = buildSuppressionKey(
      'ARC-TEST-001',
      ISSUE_ENTITY_TYPE.SpfModule,
      1,
    );
    const prefs: ValidationPreferences = {
      overrides: {
        'ARC-TEST-001': {severityOverride: IssueSeverity.Error, disabled: true},
      },
      suppressions: {[key]: {}},
    };
    // Escalated to ERROR → BLOCKING → suppression and disable are ignored
    const result = applyPreferences(issue, prefs);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe(IssueSeverity.Error);
    expect(result?.category).toBe(IssueCategory.Blocking);
  });

  it('should return issue unchanged when no override and no suppression (fast path)', () => {
    const issue = makeIssue();
    const prefs: ValidationPreferences = {
      overrides: {'OTHER-CODE': {disabled: true}}, // different code
      suppressions: {},
    };
    const result = applyPreferences(issue, prefs);
    expect(result).toBe(issue); // fast path — same reference
  });
});
