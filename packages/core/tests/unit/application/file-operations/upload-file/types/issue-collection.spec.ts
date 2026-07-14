/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IssueCollector} from '../../../../../../src/application/file-operations/upload-file/types/issue-collection.js';
import type {Issue} from '../../../../../../src/shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../../src/shared/issues/index.js';

describe('IssueCollector', () => {
  let collector: IssueCollector;

  beforeEach(() => {
    collector = new IssueCollector();
  });

  const errorIssue: Issue = {
    code: 'ARC-INSERT-MOD-001',
    message: 'Module insert failed',
    severity: IssueSeverity.Error,
    impactedEntity: {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: 1},
  };

  const warningIssue: Issue = {
    code: 'ARC-INSERT-LINK-001',
    message: 'Data link duplicate',
    severity: IssueSeverity.Warning,
    impactedEntity: {entityType: ISSUE_ENTITY_TYPE.DataLink, systemId: 2},
  };

  it('adds a single Issue', () => {
    collector.addIssue(errorIssue);
    expect(collector.getIssueCount()).toBe(1);
    expect(collector.getIssues()).toEqual([errorIssue]);
  });

  it('adds many Issues', () => {
    collector.addIssues([errorIssue, warningIssue]);
    expect(collector.getIssueCount()).toBe(2);
    expect(collector.getIssues()).toEqual([errorIssue, warningIssue]);
  });

  it('reports hasIssues correctly', () => {
    expect(collector.hasIssues()).toBe(false);
    collector.addIssue(errorIssue);
    expect(collector.hasIssues()).toBe(true);
  });

  it('clear() empties the accumulator', () => {
    collector.addIssues([errorIssue, warningIssue]);
    collector.clear();
    expect(collector.getIssueCount()).toBe(0);
    expect(collector.getIssues()).toEqual([]);
  });

  it('getIssues returns a defensive copy', () => {
    collector.addIssue(errorIssue);
    const first = collector.getIssues();
    const second = collector.getIssues();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('does not expose formatForApi', () => {
    expect(
      (collector as unknown as {formatForApi?: unknown}).formatForApi,
    ).toBeUndefined();
  });
});
