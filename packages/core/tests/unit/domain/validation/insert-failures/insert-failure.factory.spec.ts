/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {newInsertFailureIssue} from '../../../../../src/domain/validation/insert-failures/insert-failure.factory.js';
import {INSERT_FAILURE} from '../../../../../src/domain/validation/insert-failures/insert-failure-codes.js';
import {
  ISSUE_ENTITY_TYPE,
  IssueSeverity,
  IssueCategory,
} from '../../../../../src/shared/issues/index.js';

describe('newInsertFailureIssue', () => {
  it('produces a FATAL/DATA_LOSS ValidationIssue for SpfModuleInsertFailed', () => {
    const issue = newInsertFailureIssue(
      'SpfModuleInsertFailed',
      42,
      'UNIQUE constraint failed on instance_id',
      'MyModule',
    );

    expect(issue.code).toBe(INSERT_FAILURE.SpfModuleInsertFailed.code);
    expect(issue.name).toBe(INSERT_FAILURE.SpfModuleInsertFailed.name);
    expect(issue.message).toBe(
      `${INSERT_FAILURE.SpfModuleInsertFailed.name}: UNIQUE constraint failed on instance_id`,
    );
    expect(issue.severity).toBe(IssueSeverity.Fatal);
    expect(issue.defaultSeverity).toBe(IssueSeverity.Fatal);
    expect(issue.category).toBe(IssueCategory.DataLoss);
    expect(issue.impactedEntity).toEqual({
      entityType: ISSUE_ENTITY_TYPE.SpfModule,
      systemId: 42,
      displayName: 'MyModule',
    });
    expect(issue.impactedUsecases).toEqual([]);
    expect(issue.fixOptions).toBeUndefined();
  });

  it('produces the correct entityType for DataLinkInsertFailed', () => {
    const issue = newInsertFailureIssue(
      'DataLinkInsertFailed',
      100,
      'FOREIGN KEY constraint failed on source_module_system_id',
    );

    expect(issue.code).toBe(INSERT_FAILURE.DataLinkInsertFailed.code);
    expect(issue.name).toBe(INSERT_FAILURE.DataLinkInsertFailed.name);
    expect(issue.impactedEntity?.entityType).toBe(ISSUE_ENTITY_TYPE.DataLink);
    expect(issue.impactedEntity?.systemId).toBe(100);
    expect(issue.impactedEntity?.displayName).toBeUndefined();
    expect(issue.severity).toBe(IssueSeverity.Fatal);
    expect(issue.category).toBe(IssueCategory.DataLoss);
  });

  it('produces the correct entityType for KeyDefinitionInsertFailed and honours fixOptions', () => {
    const fixOptions = [
      {
        id: 'remove-key',
        description: 'Remove the conflicting key definition',
        commandType: 'DELETE_KEY_DEFINITION',
        commandPayload: {systemId: 7},
        requiredClientInputs: [],
      },
    ];

    const issue = newInsertFailureIssue(
      'KeyDefinitionInsertFailed',
      7,
      'UNIQUE constraint failed on key_id',
      undefined,
      fixOptions,
    );

    expect(issue.code).toBe(INSERT_FAILURE.KeyDefinitionInsertFailed.code);
    expect(issue.impactedEntity).toEqual({
      entityType: ISSUE_ENTITY_TYPE.KeyDefinition,
      systemId: 7,
    });
    expect(issue.fixOptions).toEqual(fixOptions);
    expect(issue.category).toBe(IssueCategory.DataLoss);
    expect(issue.severity).toBe(IssueSeverity.Fatal);
  });

  it('omits fixOptions when the array is empty', () => {
    const issue = newInsertFailureIssue(
      'DataLinkInsertFailed',
      7,
      'detail',
      undefined,
      [],
    );

    expect(issue.fixOptions).toBeUndefined();
  });
});
