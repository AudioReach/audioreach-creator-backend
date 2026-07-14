/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue, Result} from '@arc/core';
import {IssueSeverity} from '@arc/core';
import {toApiResult} from '../../../../../../src/presentation/rest/common/result/to-api-result.js';

describe('toApiResult', () => {
  it("projects an 'ok' result without issues to {data} only (no issues field)", () => {
    const result: Result<number> = {kind: 'ok', data: 42};
    const api = toApiResult(result);
    expect(api).toEqual({data: 42});
    expect('issues' in api).toBe(false);
  });

  it("projects an 'ok' result with WARNING issues to {data, issues[]}", () => {
    const warning: Issue = {
      code: 'ARC-INSERT-MOD-002',
      message: 'Module dropped',
      severity: IssueSeverity.Warning,
    };
    const result: Result<number> = {kind: 'ok', data: 7, issues: [warning]};
    const api = toApiResult(result);
    expect(api.data).toBe(7);
    expect(api.issues).toBeDefined();
    expect(api.issues).toHaveLength(1);
    expect(api.issues![0].code).toBe('ARC-INSERT-MOD-002');
    expect(api.issues![0].severity).toBe(IssueSeverity.Warning);
  });

  it("projects a 'partial' result with ERROR issues to {data, issues[]}", () => {
    const errorIssue: Issue = {
      code: 'ENTITY_NOT_FOUND',
      message: 'Module 9 not found',
      severity: IssueSeverity.Error,
    };
    const result: Result<number[]> = {
      kind: 'partial',
      data: [1, 2, 3],
      issues: [errorIssue],
    };
    const api = toApiResult(result);
    expect(api.data).toEqual([1, 2, 3]);
    expect(api.issues).toHaveLength(1);
    expect(api.issues![0].code).toBe('ENTITY_NOT_FOUND');
  });

  it("projects an 'ok' result with an empty issues array to {data} only", () => {
    const result: Result<string> = {kind: 'ok', data: 'hello', issues: []};
    const api = toApiResult(result);
    expect(api).toEqual({data: 'hello'});
    expect('issues' in api).toBe(false);
  });

  it("throws when given a 'fail' result — programming contract violation", () => {
    const failIssue: Issue = {
      code: 'ENTITY_NOT_FOUND',
      message: 'Project not found',
      severity: IssueSeverity.Error,
    };
    const result: Result<number> = {kind: 'fail', issues: [failIssue]};
    expect(() => toApiResult(result)).toThrow(
      'toApiResult received a fail Result',
    );
  });
});
