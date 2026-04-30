/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ValidationOrchestrator} from '../../../../src/application/validation/validation-orchestrator.js';
import {ValidationEngine} from '../../../../src/application/validation/validation-engine.js';
import {ValidationContextBuilder} from '../../../../src/application/validation/validation-context-builder.js';
import {VALIDATION_RULE_GROUP} from '../../../../src/domain/validation/validation-rule.js';
import {
  IssueCategory,
  IssueSeverity,
} from '../../../../src/domain/validation/issue.js';
import type {ValidationIssue} from '../../../../src/domain/validation/issue.js';
import type {ValidationQueryRepository} from '../../../../src/application/ports/persistence/repositories/validation/validation-query.repository.js';
import {EMPTY_PREFERENCES} from '../../../../src/domain/validation/validation-preferences.js';

function makeIssue(code: string, category: IssueCategory): ValidationIssue {
  return {
    code,
    name: code,
    description: '',
    defaultSeverity: IssueSeverity.Warning,
    effectiveSeverity: IssueSeverity.Warning,
    category,
    fixOptions: [],
    impactedEntity: {entityType: 'SpfModule', systemId: 1},
    impactedUsecases: [],
  };
}

function makeMockQueryRepo(
  storedIssues: ValidationIssue[] = [],
): ValidationQueryRepository {
  return {
    findModulesByFile: jest.fn().mockResolvedValue([]),
    findUsecasesByFile: jest.fn().mockResolvedValue([]),
    findSubgraphsByFile: jest.fn().mockResolvedValue([]),
    findDataLinksByFile: jest.fn().mockResolvedValue([]),
    findControlLinksByFile: jest.fn().mockResolvedValue([]),
    findDefinitionsByFile: jest.fn().mockResolvedValue([]),
    getPreferences: jest.fn().mockResolvedValue(EMPTY_PREFERENCES),
    findStoredDataLossIssues: jest.fn().mockResolvedValue(storedIssues),
  };
}

describe('ValidationOrchestrator', () => {
  it('merges stored DATA_LOSS issues into the report', async () => {
    const storedIssue = makeIssue('ARC-INSERT-MOD-001', IssueCategory.DataLoss);
    const mockQueryRepo = makeMockQueryRepo([storedIssue]);

    const engine = new ValidationEngine([]);
    const contextBuilder = new ValidationContextBuilder(mockQueryRepo);
    const orchestrator = new ValidationOrchestrator(engine, contextBuilder);

    const report = await orchestrator.validate(
      1,
      VALIDATION_RULE_GROUP.UploadFile,
    );

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('ARC-INSERT-MOD-001');
    expect(report.issues[0].category).toBe(IssueCategory.DataLoss);
    expect(report.summary.dataLoss).toBe(1);
  });

  it('returns only engine issues when no stored DATA_LOSS issues exist', async () => {
    const mockQueryRepo = makeMockQueryRepo([]);

    const engine = new ValidationEngine([]);
    const contextBuilder = new ValidationContextBuilder(mockQueryRepo);
    const orchestrator = new ValidationOrchestrator(engine, contextBuilder);

    const report = await orchestrator.validate(
      1,
      VALIDATION_RULE_GROUP.UploadFile,
    );

    expect(report.issues).toHaveLength(0);
  });
});
