/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';

describe('RoutingIssueFactory', () => {
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

  it('explains applicable edit-scope conflicts and corrective actions', () => {
    const issue = RoutingIssueFactory.editScopeConflict({
      excludedDeletedDataLinkSystemIds: [501],
      missingSurvivingEndpointSubgraphSystemIds: [200, 100],
    });

    expect(issue.message).toBe(
      'The requested changes cannot be safely applied because the selected design does not include everything needed to validate the result. ' +
        'Data links marked for deletion were explicitly excluded: [501]. Remove them from the exclusions, or cancel their deletion. ' +
        'Data links marked for deletion still use subgraphs that remain in the design, but those subgraphs are missing from the selected design: [100, 200]. Include them in the selection. ' +
        'Update the selection or remove the conflicting changes, then submit the request again.',
    );
  });
});
