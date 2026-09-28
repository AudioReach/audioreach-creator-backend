/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../../shared/issues/issue.js';
import {PATH_TERMINATION, type DfsPath} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';

export interface DfsTraversalState {
  readonly outgoingNeighbors: ReadonlyMap<number, readonly number[]>;
  readonly coveredSubgraphIds: Set<number>;
  readonly discoveredPaths: DfsPath[];
  readonly cycleWarnings: Issue[];
}

/** Traverses one deterministic DFS branch and records leaf/cycle outcomes in the state. */
export class DfsPathTraverser {
  traverse(
    traversal: DfsTraversalState,
    currentSubgraphSystemId: number,
    currentPath: readonly number[],
    activePathSubgraphIds: ReadonlySet<number>,
  ): void {
    traversal.coveredSubgraphIds.add(currentSubgraphSystemId);
    const outgoingSubgraphIds =
      traversal.outgoingNeighbors.get(currentSubgraphSystemId) ?? [];
    if (outgoingSubgraphIds.length === 0) {
      if (currentPath.length >= 2) {
        traversal.discoveredPaths.push({
          subgraphSystemIds: [...currentPath],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        });
      }
      return;
    }

    for (const nextSubgraphSystemId of outgoingSubgraphIds) {
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
      );
    }
  }
}
