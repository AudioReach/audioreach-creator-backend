/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ZeroCkvMixRule} from '../../../../../src/domain/validation/rules/module/zero-ckv-mix.rule.js';
import {
  IssueSeverity,
  IssueCategory,
  ISSUE_ENTITY_TYPE,
} from '../../../../../src/shared/issues/index.js';
import {VALIDATION_RULE_GROUP} from '../../../../../src/domain/validation/validation-rule.js';
import {EMPTY_PREFERENCES} from '../../../../../src/domain/validation/validation-preferences.js';
import type {ModuleValidationContext} from '../../../../../src/domain/validation/validation-context.js';
import type {SpfModule} from '../../../../../src/domain/entities/usecase-data/module/spf-module.js';
import {KvData} from '../../../../../src/domain/entities/common/entities/kv-data.js';

function makeKv(systemId: number, valueDefinitionSystemIds: number[]): KvData {
  return new KvData({systemId, valueDefinitionSystemIds, uiPersistence: null});
}

function makeModule(
  systemId: number,
  ckvs: KvData[],
  alias?: string,
): SpfModule {
  return {systemId, ckvs, alias} as unknown as SpfModule;
}

function makeContext(modules: SpfModule[]): ModuleValidationContext {
  return {
    fileSystemId: 1,
    preferences: EMPTY_PREFERENCES,
    modules,
    definitions: new Map(),
    modulesBySystemId: new Map(modules.map(m => [m.systemId, m])),
    usecasesByModuleSystemId: new Map(),
  };
}

describe('ZeroCkvMixRule', () => {
  const rule = new ZeroCkvMixRule();

  it('should be in SAVE_FILE group only', () => {
    expect(rule.groups).toContain(VALIDATION_RULE_GROUP.SaveFile);
    expect(rule.groups).toHaveLength(1);
  });

  it('should require SpfModule entity type only', () => {
    expect(rule.requiredEntityTypes).toContain(ISSUE_ENTITY_TYPE.SpfModule);
    expect(rule.requiredEntityTypes).toHaveLength(1);
  });

  it('should return no issue when module has no CKVs', () => {
    const context = makeContext([makeModule(1, [])]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when module has only a zero-key CKV', () => {
    const context = makeContext([makeModule(1, [makeKv(10, [])])]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return no issue when module has only non-zero CKV entries', () => {
    const context = makeContext([
      makeModule(1, [makeKv(10, [100]), makeKv(11, [101])]),
    ]);
    expect(rule.validate(context)).toHaveLength(0);
  });

  it('should return an ERROR issue when module has both zero and non-zero CKVs', () => {
    const context = makeContext([
      makeModule(1, [makeKv(10, []), makeKv(11, [100])], 'TestModule'),
    ]);
    const issues = rule.validate(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('ARC-MOD-005');
    expect(issues[0].severity).toBe(IssueSeverity.Error);
    expect(issues[0].category).toBe(IssueCategory.Blocking);
    expect(issues[0].impactedEntity?.entityType).toBe(
      ISSUE_ENTITY_TYPE.SpfModule,
    );
    expect(issues[0].impactedEntity?.systemId).toBe(1);
    expect(issues[0].fixOptions).toHaveLength(1);
    expect(issues[0].fixOptions![0].commandType).toBe('RemoveCkvCommand');
    expect(issues[0].fixOptions![0].commandPayload).toEqual({
      moduleSystemId: 1,
      ckvSystemId: 10, // systemId of the zero-key CKV entry
    });
  });
});
