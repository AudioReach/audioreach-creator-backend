/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../../../src/shared/issues/severity.js';

describe('RoutingIssueFactory', () => {
  it('creates the MDF requested-KV issue', () => {
    expect(RoutingIssueFactory.mdfKvAssigned(20)).toEqual({
      code: 'ARC-ROUTING-MDF-01',
      severity: 'ERROR',
      impactedEntity: {entityType: 'Subgraph', systemId: 20},
      message: 'MDF subgraph 20 cannot contain requested KV values.',
    });
  });

  it('creates deterministic SGKV malformed and missing-value issues', () => {
    const malformed = RoutingIssueFactory.sgkvMalformed(10, [30, 20, 20]);
    const missing = RoutingIssueFactory.sgkvValuesNotFound(10, [30, 20, 20]);

    expect(malformed).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-SGKV-MALFORMED',
        severity: 'ERROR',
        impactedEntity: {entityType: 'Subgraph', systemId: 10},
        message: expect.stringContaining('[20, 30]'),
      }),
    );
    expect(missing).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-SGKV-VALUE-NOT-FOUND',
        severity: 'ERROR',
        impactedEntity: {entityType: 'Subgraph', systemId: 10},
        message: expect.stringContaining('[20, 30]'),
      }),
    );
  });

  it('explains which affected use cases must be selected', () => {
    const issue = RoutingIssueFactory.deletionSelectionRequired(
      new Set([57, 42]),
      new Set([57]),
    );

    expect(issue.message).toBe(
      'Some use cases are affected by the requested changes, but they were not selected. ' +
        'Affected use case IDs: [42, 57]. ' +
        'Missing from your selection: [57]. ' +
        'Select all affected use cases and submit the request again.',
    );
    expect(issue.impactedUsecases).toEqual([42, 57]);
  });

  it('explains incomplete surviving deletion scope', () => {
    const issue = RoutingIssueFactory.deletionScopeIncomplete(
      new Set([57, 42]),
      [200, 100],
      [501],
      [601],
    );

    expect(issue.message).toBe(
      'The routing input does not include the complete surviving topology for the affected use cases. ' +
        'Affected use case IDs: [42, 57]. ' +
        'Missing subgraph IDs: [100, 200]. ' +
        'Missing data link IDs: [501]. ' +
        'Missing control link IDs: [601].',
    );
  });

  it('creates an error issue for an incomplete data-link chain', () => {
    const issue = RoutingIssueFactory.incompleteDataChain([10, 11, 12], 10, 99);

    expect(issue.severity).toBe(IssueSeverity.Error);
    expect(issue.code).toBe(ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN);
    expect(issue.message).toContain('10');
    expect(issue.message).toContain('99');
  });

  it('creates an error issue for an incomplete control-link chain', () => {
    const issue = RoutingIssueFactory.incompleteControlChain(
      [20, 21],
      [20, 30, 40],
    );

    expect(issue.severity).toBe(IssueSeverity.Error);
    expect(issue.code).toBe(ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN);
    expect(issue.message).toContain('30');
  });
});
