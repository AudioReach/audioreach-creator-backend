/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {MissingDefinitionRule} from '../../../../../src/domain/validation/rules/module/missing-definition.rule.js';
import {
  IssueCategory,
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../src/shared/issues/index.js';
import {VALIDATION_RULE_GROUP} from '../../../../../src/domain/validation/validation-rule.js';
import {EMPTY_PREFERENCES} from '../../../../../src/domain/validation/validation-preferences.js';
import type {ModuleValidationContext} from '../../../../../src/domain/validation/validation-context.js';
import type {SpfModule} from '../../../../../src/domain/entities/usecase-data/module/spf-module.js';
import type {SpfModuleDefinition} from '../../../../../src/domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';

function makeContext(
  modules: Partial<SpfModule>[],
  definitions: Map<number, Partial<SpfModuleDefinition>>,
  usecasesByModuleId: Map<number, any[]> = new Map(),
): ModuleValidationContext {
  return {
    fileSystemId: 1,
    preferences: EMPTY_PREFERENCES,
    modules: modules as SpfModule[],
    definitions: definitions as Map<number, SpfModuleDefinition>,
    modulesBySystemId: new Map(modules.map(m => [m.systemId!, m as SpfModule])),
    usecasesByModuleId,
  };
}

describe('MissingDefinitionRule', () => {
  const rule = new MissingDefinitionRule();

  it('should have code ARC-MOD-001', () => {
    expect(rule.code).toBe('ARC-MOD-001');
  });

  it('should be in UPLOAD_FILE and COMMIT groups', () => {
    expect(rule.groups).toContain(VALIDATION_RULE_GROUP.UploadFile);
    expect(rule.groups).toContain(VALIDATION_RULE_GROUP.Commit);
  });

  it('should require SpfModule and SpfModuleDefinition entity types', () => {
    expect(rule.requiredEntityTypes).toContain(ISSUE_ENTITY_TYPE.SpfModule);
    expect(rule.requiredEntityTypes).toContain(
      ISSUE_ENTITY_TYPE.SpfModuleDefinition,
    );
  });

  it('should return no issues when all modules have definitions', () => {
    const defId = 100;
    const context = makeContext(
      [{systemId: 1, definitionSystemId: defId}],
      new Map([[defId, {systemId: defId}]]),
    );
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return ERROR issue when module references missing definition', () => {
    const context = makeContext(
      [{systemId: 1, definitionSystemId: 999, alias: 'TestModule'}],
      new Map(),
    );
    const issues = rule.validate(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('ARC-MOD-001');
    expect(issues[0].severity).toBe(IssueSeverity.Error);
    expect(issues[0].category).toBe(IssueCategory.Blocking);
    expect(issues[0].impactedEntity?.entityType).toBe(
      ISSUE_ENTITY_TYPE.SpfModule,
    );
    expect(issues[0].impactedEntity?.systemId).toBe(1);
    expect(issues[0].impactedEntity?.displayName).toBe('TestModule');
  });

  it('should return one issue per module with missing definition', () => {
    const context = makeContext(
      [
        {systemId: 1, definitionSystemId: 999},
        {systemId: 2, definitionSystemId: 888},
      ],
      new Map(),
    );
    expect(rule.validate(context)).toHaveLength(2);
  });

  it('should not return issue for modules whose definition exists', () => {
    const context = makeContext(
      [
        {systemId: 1, definitionSystemId: 100},
        {systemId: 2, definitionSystemId: 999}, // missing
      ],
      new Map([[100, {systemId: 100}]]),
    );
    const issues = rule.validate(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].impactedEntity?.systemId).toBe(2);
  });

  it('should populate impactedUsecases from usecasesByModuleId', () => {
    const usecasesByModuleId = new Map([
      [1, [{systemId: 101} as any, {systemId: 102} as any]],
    ]);
    const context = makeContext(
      [{systemId: 1, definitionSystemId: 999}],
      new Map(),
      usecasesByModuleId,
    );
    const issues = rule.validate(context);
    expect(issues[0].impactedUsecases).toEqual([101, 102]);
  });

  it('should return empty impactedUsecases when module is in no usecases', () => {
    const context = makeContext(
      [{systemId: 1, definitionSystemId: 999}],
      new Map(),
    );
    const issues = rule.validate(context);
    expect(issues[0].impactedUsecases).toEqual([]);
  });
});
