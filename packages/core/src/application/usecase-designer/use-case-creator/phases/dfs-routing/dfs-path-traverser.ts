/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../../shared/issues/issue.js';
import {PATH_TERMINATION, type DfsPath} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';

export interface DfsTraversalState {
  readonly outgoingEdges: ReadonlyMap<number, readonly DfsTraversalEdge[]>;
  readonly coveredSubgraphIds: Set<number>;
  readonly discoveredPaths: DfsPath[];
  readonly cycleWarnings: Issue[];
  readonly ecIssues: Issue[];
  readonly traversedRightSides: Set<string>;
}

export interface DfsTraversalEdge {
  readonly destSubgraphSystemId: number;
  readonly ecRepresentativeDataLinkSystemId: number | null;
}

/** Traverses one deterministic DFS branch and records leaf/cycle outcomes in the state. */
export class DfsPathTraverser {
  traverse(
    traversal: DfsTraversalState,
    currentSubgraphSystemId: number,
    currentPath: readonly number[],
    activePathSubgraphIds: ReadonlySet<number>,
    firstEcRepresentativeDataLinkSystemId: number | null = null,
    emitSingleSubgraphLeaf = false,
  ): void {
    traversal.coveredSubgraphIds.add(currentSubgraphSystemId);
    const outgoingEdges =
      traversal.outgoingEdges.get(currentSubgraphSystemId) ?? [];
    if (outgoingEdges.length === 0) {
      if (currentPath.length >= 2 || emitSingleSubgraphLeaf) {
        traversal.discoveredPaths.push({
          subgraphSystemIds: [...currentPath],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        });
      }
      return;
    }

    const regularEdges = outgoingEdges.filter(
      edge => edge.ecRepresentativeDataLinkSystemId === null,
    );
    for (const edge of regularEdges) {
      const nextSubgraphSystemId = edge.destSubgraphSystemId;
      if (activePathSubgraphIds.has(nextSubgraphSystemId)) {
        traversal.discoveredPaths.push({
          subgraphSystemIds: [...currentPath],
          termination: PATH_TERMINATION.Cycle,
          ecBoundaryLinkId: null,
        });
        traversal.cycleWarnings.push(
          RoutingIssueFactory.cycleDetected(nextSubgraphSystemId),
        );
        continue;
      }
      const nextActivePathSubgraphIds = new Set(activePathSubgraphIds);
      nextActivePathSubgraphIds.add(nextSubgraphSystemId);
      this.traverse(
        traversal,
        nextSubgraphSystemId,
        [...currentPath, nextSubgraphSystemId],
        nextActivePathSubgraphIds,
        firstEcRepresentativeDataLinkSystemId,
        emitSingleSubgraphLeaf,
      );
    }

    for (const edge of outgoingEdges) {
      if (edge.ecRepresentativeDataLinkSystemId === null) continue;
      if (firstEcRepresentativeDataLinkSystemId !== null) {
        traversal.ecIssues.push(
          RoutingIssueFactory.multipleEcConnectionsOnPath(
            [...currentPath, edge.destSubgraphSystemId],
            firstEcRepresentativeDataLinkSystemId,
            edge.ecRepresentativeDataLinkSystemId,
          ),
        );
        continue;
      }
      traversal.discoveredPaths.push({
        subgraphSystemIds: [...currentPath],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: edge.ecRepresentativeDataLinkSystemId,
      });
      const rightSideKey = `${edge.ecRepresentativeDataLinkSystemId}:${edge.destSubgraphSystemId}`;
      if (traversal.traversedRightSides.has(rightSideKey)) continue;
      traversal.traversedRightSides.add(rightSideKey);
      this.traverse(
        traversal,
        edge.destSubgraphSystemId,
        [edge.destSubgraphSystemId],
        new Set([edge.destSubgraphSystemId]),
        edge.ecRepresentativeDataLinkSystemId,
        true,
      );
    }
  }
}
