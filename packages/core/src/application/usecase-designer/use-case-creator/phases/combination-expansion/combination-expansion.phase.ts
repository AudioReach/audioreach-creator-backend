/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {
  AutoUsecaseCandidate,
  ManualUsecaseCandidate,
} from '../../contracts/routing-state.js';
import {USECASE_CANDIDATE_KIND} from '../../contracts/routing-state.js';
import {
  RoutingIssueFactory,
  type UsecaseCandidateConflictDetails,
} from '../../issues/routing-issue-factory.js';
import {
  aggregateGkv,
  expandPath,
  expandSubgraphCombinations,
  type PathExpansion,
} from './path-combination-expander.js';

/** One valid SGKV assignment paired with its aggregated GKV, ready to become a candidate. */
type ExpandedAssignment = {
  readonly sgkvAssignment: PathExpansion['validAssignments'][number];
  readonly gkv: ReturnType<typeof aggregateGkv>;
};

/** Either the single conflict blocking this path/topology, or its usable assignments — never both. */
interface ExpansionOutcome {
  readonly conflict: UsecaseCandidateConflictDetails | null;
  readonly assignments: readonly ExpandedAssignment[];
}

/**
 * Turns one `PathExpansion` result into a conflict record or a list of candidate-ready
 * assignments. A path with no valid assignments but at least one recorded conflict is
 * unroutable; otherwise each valid assignment is aggregated into a GKV, dropping any
 * assignment whose KV pairs cancel out to nothing (an empty GKV can't back a usecase).
 */
function resolveExpansion(
  pathExpansion: PathExpansion,
  memberSubgraphSystemIds: readonly number[],
): ExpansionOutcome {
  if (
    pathExpansion.validAssignments.length === 0 &&
    pathExpansion.conflicts.length > 0
  ) {
    return {
      conflict: {
        pathSubgraphSystemIds: memberSubgraphSystemIds,
        conflicts: pathExpansion.conflicts,
      },
      assignments: [],
    };
  }
  const assignments: ExpandedAssignment[] = [];
  for (const sgkvAssignment of pathExpansion.validAssignments) {
    const gkv = aggregateGkv(sgkvAssignment);
    if (gkv.length > 0) assignments.push({sgkvAssignment, gkv});
  }
  return {conflict: null, assignments};
}

export class CombinationExpansionPhase {
  /**
   * Expands Phase 7's DFS paths (auto mode) or the manual topology's member subgraphs
   * (manual mode) into KV-conflict-free usecase candidates.
   *
   * Synchronous on purpose: Phase 4's KV resolutions are already in memory and nothing
   * here does I/O. `RoutingEngine` awaits every phase's result regardless of whether it
   * returns a `Result` directly or a `Promise<Result>`.
   */
  run(context: RoutingContext): Result<void> {
    if (!context.kvResolutions) {
      throw new Error(
        'CombinationExpansionPhase requires Phase 4 KV resolutions',
      );
    }
    const perSg = context.kvResolutions.perSg;
    // Bind to a local so the mode narrowing below survives the loops and calls that
    // follow it — narrowing a property access directly (`context.input.mode`) does not.
    const {input} = context;

    if (input.mode === ROUTING_MODE.Auto) {
      // Each DFS path expands independently; collect locally so one conflicting path
      // cannot publish the candidates already found for the other paths.
      const conflictingPathDetails: UsecaseCandidateConflictDetails[] = [];
      const automaticCandidates: AutoUsecaseCandidate[] = [];
      for (const path of context.dfsPaths) {
        const outcome = resolveExpansion(
          expandPath(path, perSg),
          path.subgraphSystemIds,
        );
        if (outcome.conflict) {
          conflictingPathDetails.push(outcome.conflict);
          continue;
        }
        for (const {sgkvAssignment, gkv} of outcome.assignments) {
          automaticCandidates.push({
            kind: USECASE_CANDIDATE_KIND.Auto,
            path,
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
      context.usecaseCandidates.automaticCandidates.push(
        ...automaticCandidates,
      );
      return Result.ok();
    }

    // Manual mode has exactly one topology spanning every member subgraph — a single
    // expansion, not a per-path loop.
    const memberSubgraphSystemIds = input.graphSnapshot.subgraphs.map(
      routingSubgraph => routingSubgraph.subgraph.systemId,
    );
    const outcome = resolveExpansion(
      expandSubgraphCombinations(memberSubgraphSystemIds, perSg),
      memberSubgraphSystemIds,
    );
    if (outcome.conflict) {
      return Result.fail(
        RoutingIssueFactory.noValidCombination(outcome.conflict),
      );
    }
    const manualCandidates: ManualUsecaseCandidate[] = outcome.assignments.map(
      ({sgkvAssignment, gkv}) => ({
        kind: USECASE_CANDIDATE_KIND.Manual,
        memberSubgraphSystemIds,
        topology: input.manualTopology,
        sgkvAssignment,
        gkv,
      }),
    );
    context.usecaseCandidates.manualCandidates.push(...manualCandidates);
    return Result.ok();
  }
}
