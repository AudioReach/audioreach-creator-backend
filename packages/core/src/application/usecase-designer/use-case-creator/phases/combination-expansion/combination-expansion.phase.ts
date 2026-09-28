/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Result,
  type Result as ResultType,
} from '../../../../../application/shared/result/result.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {
  DfsPath,
  RoutingCombination,
} from '../../contracts/routing-state.js';
import {PATH_TERMINATION} from '../../contracts/routing-state.js';
import {
  RoutingIssueFactory,
  type RoutingCombinationConflictDetails,
} from '../../issues/routing-issue-factory.js';
import {aggregateGkv, expandPath} from './path-combination-expander.js';

function syntheticManualPath(context: RoutingContext): DfsPath {
  return {
    subgraphSystemIds: context.input.graphSnapshot.subgraphs.map(
      routingSubgraph => routingSubgraph.subgraph.systemId,
    ),
    termination: PATH_TERMINATION.NaturalLeaf,
    ecBoundaryLinkId: null,
  };
}

export class CombinationExpansionPhase {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase execution remains promise-based for ordered orchestration.
  async run(context: RoutingContext): Promise<ResultType<void>> {
    if (!context.kvResolutions) {
      throw new Error(
        'CombinationExpansionPhase requires Phase 4 KV resolutions',
      );
    }

    // Manual routing supplies the SG set directly; automatic routing consumes DFS paths.
    const routingPaths =
      context.input.mode === ROUTING_MODE.Manual
        ? [syntheticManualPath(context)]
        : [...context.dfsPaths];
    // Keep candidates local so a conflict on one path cannot publish partial results.
    const validCombinations: RoutingCombination[] = [];
    const conflictingPathDetails: RoutingCombinationConflictDetails[] = [];

    for (const routingPath of routingPaths) {
      const pathExpansion = expandPath(
        routingPath,
        context.kvResolutions.perSg,
      );
      if (
        pathExpansion.validAssignments.length === 0 &&
        pathExpansion.conflicts.length > 0
      ) {
        conflictingPathDetails.push({
          pathSubgraphSystemIds: routingPath.subgraphSystemIds,
          conflicts: pathExpansion.conflicts,
        });
        continue;
      }
      for (const sgkvAssignment of pathExpansion.validAssignments) {
        const gkv = aggregateGkv(sgkvAssignment);
        if (gkv.length === 0) continue;
        validCombinations.push({
          path: routingPath,
          sgkvAssignment,
          gkv,
        });
      }
    }

    if (conflictingPathDetails.length > 0) {
      return Result.fail(
        ...conflictingPathDetails.map(details =>
          RoutingIssueFactory.noValidCombination(details),
        ),
      );
    }
    context.routingCandidates.combinations.push(...validCombinations);
    return Result.ok();
  }
}
