/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';

function subgraphs(...systemIds: number[]) {
  return systemIds.map(systemId => ({entityType: 'Subgraph', systemId}));
}

describe('RoutingIssueFactory', () => {
  describe('noValidCombination', () => {
    it('reports each key conflict once, sorted by key and subgraphs', () => {
      const issue = RoutingIssueFactory.noValidCombination({
        pathSubgraphSystemIds: [7, 3, 5],
        conflicts: [
          {keyDefSystemId: 2, conflictingSubgraphSystemIds: [5, 3]},
          {keyDefSystemId: 1, conflictingSubgraphSystemIds: [7, 5]},
          {keyDefSystemId: 2, conflictingSubgraphSystemIds: [3, 5]},
          {keyDefSystemId: 1, conflictingSubgraphSystemIds: [3, 7]},
        ],
      });

      expect(issue.impactedEntity).toEqual({
        entityType: 'Subgraph',
        systemId: 7,
      });
      expect(issue.relatedEntities).toEqual({
        path: subgraphs(7, 3, 5),
        conflicts: [
          {
            key: {entityType: 'KeyDefinition', systemId: 1},
            subgraphs: subgraphs(3, 7),
          },
          {
            key: {entityType: 'KeyDefinition', systemId: 1},
            subgraphs: subgraphs(5, 7),
          },
          {
            key: {entityType: 'KeyDefinition', systemId: 2},
            subgraphs: subgraphs(3, 5),
          },
        ],
      });
    });

    it('has no impacted entity when the path is empty', () => {
      const issue = RoutingIssueFactory.noValidCombination({
        pathSubgraphSystemIds: [],
        conflicts: [],
      });

      expect(issue.impactedEntity).toBeUndefined();
      expect(issue.relatedEntities).toEqual({path: [], conflicts: []});
    });
  });

  describe('usecaseAutoIsland', () => {
    it('lists the lost connections sorted by source, destination and link', () => {
      const issue = RoutingIssueFactory.usecaseAutoIsland(40, [
        {
          sourceSubgraphSystemId: 2,
          destSubgraphSystemId: 3,
          deletedDataLinkSystemId: 9,
        },
        {
          sourceSubgraphSystemId: 1,
          destSubgraphSystemId: 4,
          deletedDataLinkSystemId: 8,
        },
        {
          sourceSubgraphSystemId: 1,
          destSubgraphSystemId: 3,
          deletedDataLinkSystemId: 7,
        },
        {
          sourceSubgraphSystemId: 1,
          destSubgraphSystemId: 3,
          deletedDataLinkSystemId: 6,
        },
      ]);

      expect(issue.impactedEntity).toEqual({
        entityType: 'UseCase',
        systemId: 40,
      });
      expect(
        issue.relatedEntities.lostConnections.map(connection => [
          connection.source.systemId,
          connection.destination.systemId,
          connection.deletedDataLink.systemId,
        ]),
      ).toEqual([
        [1, 3, 6],
        [1, 3, 7],
        [1, 4, 8],
        [2, 3, 9],
      ]);
    });
  });
});
