/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {failedToIssues} from '../../../../../src/application/shared/result/failed-to-issues.js';
import {FAILED_ENTITY_REASON} from '../../../../../src/application/ports/persistence/batch-read.js';
import {ISSUE_CODE} from '../../../../../src/shared/issues/operational-codes.js';
import {ISSUE_ENTITY_TYPE} from '../../../../../src/shared/issues/impacted-entity.js';

describe('failedToIssues', () => {
  it('reports a missing entity by its hex systemId', () => {
    const [issue] = failedToIssues(ISSUE_ENTITY_TYPE.Subgraph, [
      {systemId: 42, reason: FAILED_ENTITY_REASON.NotFound},
    ]);

    expect(issue).toEqual({
      code: ISSUE_CODE.ENTITY_NOT_FOUND,
      message:
        'Subgraph with systemId: 0x0000002A was not found in this project.',
      severity: 'ERROR',
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: 42,
        displayName: 'Subgraph with systemId: 0x0000002A',
      },
    });
  });

  it('names a skipped entity by its identity, not its systemId', () => {
    const [issue] = failedToIssues(ISSUE_ENTITY_TYPE.Subgraph, [
      {
        systemId: 7,
        reason: FAILED_ENTITY_REASON.UnresolvedReference,
        identity: {name: 'Speaker', naturalId: 4},
        missingRef: {entityType: 'ValueDefinition', systemId: 9},
      },
    ]);

    expect(issue.code).toBe(ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE);
    expect(issue.message).toBe(
      "Subgraph 'Speaker' (0x00000004) was skipped: it references " +
        'Value with systemId: 0x00000009, which was not found in this project.',
    );
    expect(issue.impactedEntity).toEqual({
      entityType: ISSUE_ENTITY_TYPE.Subgraph,
      systemId: 7,
      displayName: "Subgraph 'Speaker' (0x00000004)",
    });
  });

  it('falls back to the systemId when a skipped entity has no identity', () => {
    const [issue] = failedToIssues(ISSUE_ENTITY_TYPE.UseCase, [
      {systemId: 8, reason: FAILED_ENTITY_REASON.UnresolvedReference},
    ]);

    expect(issue.message).toBe(
      'UseCase with systemId: 0x00000008 was skipped: ' +
        'a reference it uses was not found in this project.',
    );
  });

  it('returns no issues when nothing failed', () => {
    expect(failedToIssues(ISSUE_ENTITY_TYPE.Subgraph, [])).toEqual([]);
  });
});
