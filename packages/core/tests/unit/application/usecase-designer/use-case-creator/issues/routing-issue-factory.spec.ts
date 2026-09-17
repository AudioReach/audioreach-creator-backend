/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import type {DataLinkLossPair} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';

describe('RoutingIssueFactory', () => {
  it('creates one deterministic duplicate active-subgraph issue', () => {
    expect(
      RoutingIssueFactory.duplicateActiveSubgraphSelections(new Set([7, 3])),
    ).toEqual({
      code: 'ARC-ROUTING-PREVAL-DUPLICATE-ACTIVE-SUBGRAPH-SELECTION',
      message:
        'Duplicate active-subgraph selections are not allowed ' +
        '(systemIds: [3, 7]).',
      severity: 'ERROR',
    });
  });

  it('creates a deterministic edit-scope conflict issue', () => {
    const issue = RoutingIssueFactory.editScopeConflict({
      excludedAddedSubgraphSystemIds: [30, 10],
      missingRequiredEndpointSubgraphSystemIds: [40, 20],
    });

    expect(issue).toEqual({
      code: 'ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT',
      message:
        'Routing edit scope conflicts: excludedAddedSubgraphSystemIds=[10, 30]; ' +
        'missingRequiredEndpointSubgraphSystemIds=[20, 40].',
      severity: 'ERROR',
    });
  });

  it('creates a blocking data-link integrity issue for the affected link', () => {
    expect(RoutingIssueFactory.dataLinkIntegrity(300, 10, 20)).toEqual({
      code: 'ARC-ROUTING-PREVAL-DATALINK-INTEGRITY',
      message:
        'Intra-usecase data link 300 references a missing endpoint ' +
        '(sourceSubgraphSystemId: 10, destSubgraphSystemId: 20).',
      severity: 'ERROR',
      impactedEntity: {entityType: 'DataLink', systemId: 300},
    });
  });

  it('creates a non-blocking island warning for the affected subgraph', () => {
    expect(RoutingIssueFactory.islandDetected(10)).toEqual({
      code: 'ARC-ROUTING-ISLAND-DETECTED',
      message:
        'Subgraph 10 has no effective intra-usecase data-link adjacency.',
      severity: 'WARNING',
      impactedEntity: {entityType: 'Subgraph', systemId: 10},
    });
  });

  it('reports sorted full and missing affected-usecase sets for DEL-02', () => {
    expect(
      RoutingIssueFactory.deletionSelectionRequired(
        new Set([30, 10, 20]),
        new Set([30, 20]),
      ),
    ).toEqual({
      code: 'ARC-ROUTING-DEL-02',
      message:
        'Every affected usecase must be selected ' +
        '(fullAffectedUsecaseSystemIds: [10, 20, 30], ' +
        'missingUsecaseSystemIds: [20, 30]).',
      severity: 'ERROR',
      impactedUsecases: [10, 20, 30],
    });
  });

  it('creates one automatic-island warning containing sorted degraded pairs', () => {
    const dataLinkLossPairs: readonly DataLinkLossPair[] = [
      {
        sourceSubgraphSystemId: 30,
        destSubgraphSystemId: 40,
        deletedDataLinkSystemId: 400,
      },
      {
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 20,
        deletedDataLinkSystemId: 200,
      },
    ];
    expect(
      RoutingIssueFactory.usecaseAutoIsland(50, dataLinkLossPairs),
    ).toEqual({
      code: 'ARC-ROUTING-UC-AUTO-ISLAND',
      message:
        'Usecase 50 changed to ISLAND because data-link coverage was lost ' +
        '(dataLinkLossPairs: [10->20 via deleted dataLink 200, ' +
        '30->40 via deleted dataLink 400]).',
      severity: 'WARNING',
      impactedEntity: {entityType: 'UseCase', systemId: 50},
    });
  });
});
