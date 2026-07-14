/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationEngine} from '../../../../src/application/validation/validation-engine.js';
import {VALIDATION_RULE_GROUP} from '../../../../src/domain/validation/validation-rule.js';
import {
  IssueCategory,
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../src/shared/issues/index.js';
import type {IssueEntityType} from '../../../../src/shared/issues/index.js';
import {EMPTY_PREFERENCES} from '../../../../src/domain/validation/validation-preferences.js';
import type {ValidationRule} from '../../../../src/domain/validation/validation-rule.js';
import type {FileValidationContext} from '../../../../src/domain/validation/validation-context.js';
import type {ValidationIssue} from '../../../../src/domain/validation/issue.js';
import type {ValidationRuleGroup} from '../../../../src/domain/validation/validation-rule.js';

function makeContext(
  overrides: Partial<FileValidationContext> = {},
): FileValidationContext {
  return {
    fileSystemId: 1,
    preferences: EMPTY_PREFERENCES,
    dataLinks: [],
    controlLinks: [],
    modulesBySystemId: new Map(),
    usecasesByModuleId: new Map(),
    modules: [],
    definitions: new Map(),
    subgraphs: [],
    subgraphsBySystemId: new Map(),
    modulesBySubgraphId: new Map(),
    usecases: [],
    ...overrides,
  };
}

function makeIssue(code: string): ValidationIssue {
  return {
    code,
    name: code,
    message: code,
    defaultSeverity: IssueSeverity.Warning,
    severity: IssueSeverity.Warning,
    category: IssueCategory.NonBlocking,
    fixOptions: [],
    impactedEntity: {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: 1},
    impactedUsecases: [],
  };
}

function makeRule(
  code: string,
  groups: ValidationRuleGroup[],
  issues: ValidationIssue[],
  requiredEntityTypes: IssueEntityType[] = [],
): ValidationRule<FileValidationContext> {
  return {
    code,
    defaultSeverity: IssueSeverity.Warning,
    groups,
    requiredEntityTypes,
    validate: () => issues,
  };
}

describe('ValidationEngine', () => {
  it('should run all rules in UPLOAD_FILE group and return report', () => {
    const rule1 = makeRule(
      'R1',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R1')],
    );
    const rule2 = makeRule(
      'R2',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R2')],
    );
    const engine = new ValidationEngine([rule1, rule2]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.UploadFile);
    expect(report.issues).toHaveLength(2);
  });

  it('should only run rules in COMMIT group when group=COMMIT', () => {
    const uploadRule = makeRule(
      'UPLOAD',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('UPLOAD')],
    );
    const commitRule = makeRule(
      'COMMIT',
      [VALIDATION_RULE_GROUP.Commit],
      [makeIssue('COMMIT')],
    );
    const engine = new ValidationEngine([uploadRule, commitRule]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.Commit);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('COMMIT');
  });

  it('should run rules that belong to multiple groups', () => {
    const multiGroupRule = makeRule(
      'MULTI',
      [VALIDATION_RULE_GROUP.UploadFile, VALIDATION_RULE_GROUP.Commit],
      [makeIssue('MULTI')],
    );
    const engine = new ValidationEngine([multiGroupRule]);
    expect(
      engine.run(makeContext(), VALIDATION_RULE_GROUP.UploadFile).issues,
    ).toHaveLength(1);
    expect(
      engine.run(makeContext(), VALIDATION_RULE_GROUP.Commit).issues,
    ).toHaveLength(1);
    expect(
      engine.run(makeContext(), VALIDATION_RULE_GROUP.SaveFile).issues,
    ).toHaveLength(0);
  });

  it('should filter out disabled issues via preferences', () => {
    const rule = makeRule(
      'R1',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R1')],
    );
    const context = makeContext({
      preferences: {overrides: {R1: {disabled: true}}, suppressions: {}},
    });
    const engine = new ValidationEngine([rule]);
    const report = engine.run(context, VALIDATION_RULE_GROUP.UploadFile);
    expect(report.issues).toHaveLength(0);
  });

  it('should return empty report when no rules registered', () => {
    const engine = new ValidationEngine([]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.UploadFile);
    expect(report.issues).toHaveLength(0);
    expect(report.blockedSave).toBe(false);
  });

  it('should return empty report when no rules match the group', () => {
    const rule = makeRule(
      'R1',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R1')],
    );
    const engine = new ValidationEngine([rule]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.Commit);
    expect(report.issues).toHaveLength(0);
  });

  it('should aggregate issues from multiple rules', () => {
    const rule1 = makeRule(
      'R1',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R1-a'), makeIssue('R1-b')],
    );
    const rule2 = makeRule(
      'R2',
      [VALIDATION_RULE_GROUP.UploadFile],
      [makeIssue('R2')],
    );
    const engine = new ValidationEngine([rule1, rule2]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.UploadFile);
    expect(report.issues).toHaveLength(3);
  });

  it('should set blockedSave=true when any BLOCKING issue exists', () => {
    const blockingIssue: ValidationIssue = {
      ...makeIssue('BLOCKING'),
      severity: IssueSeverity.Error,
      category: IssueCategory.Blocking,
    };
    const rule = makeRule(
      'BLOCKING',
      [VALIDATION_RULE_GROUP.UploadFile],
      [blockingIssue],
    );
    const engine = new ValidationEngine([rule]);
    const report = engine.run(makeContext(), VALIDATION_RULE_GROUP.UploadFile);
    expect(report.blockedSave).toBe(true);
  });
});
