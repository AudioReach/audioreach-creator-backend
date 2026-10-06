/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Result,
  type Result as ResultType,
} from '../../../../../application/shared/result/result.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {
  ROUTING_MODE,
  type ManualTopology,
} from '../../contracts/routing-input.js';
import type {
  AutoUsecaseCandidate,
  DfsPath,
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
} from './path-combination-expander.js';

type ExpansionInput =
  | {
      readonly kind: typeof ROUTING_MODE.Auto;
      readonly memberSubgraphSystemIds: readonly number[];
      readonly path: DfsPath;
    }
  | {
      readonly kind: typeof ROUTING_MODE.Manual;
      readonly memberSubgraphSystemIds: readonly number[];
      readonly topology: ManualTopology;
    };

export class CombinationExpansionPhase {
  // eslint-disable-next-line sonarjs/cognitive-complexity, @typescript-eslint/require-await -- This method intentionally keeps mode-specific expansion, conflict aggregation, and atomic candidate publication together while preserving the promise-based phase contract.
  async run(context: RoutingContext): Promise<ResultType<void>> {
    if (!context.kvResolutions) {
      throw new Error(
        'CombinationExpansionPhase requires Phase 4 KV resolutions',
      );
    }

    // Keep candidates local so a conflict on one path cannot publish partial results.
    const automaticCandidates: AutoUsecaseCandidate[] = [];
    const manualCandidates: ManualUsecaseCandidate[] = [];
    const conflictingPathDetails: UsecaseCandidateConflictDetails[] = [];

    const expansionInputs: readonly ExpansionInput[] =
      context.input.mode === ROUTING_MODE.Auto
        ? context.dfsPaths.map(path => ({
            kind: ROUTING_MODE.Auto,
            memberSubgraphSystemIds: path.subgraphSystemIds,
            path,
          }))
        : [
            {
              kind: ROUTING_MODE.Manual,
              memberSubgraphSystemIds:
                context.input.graphSnapshot.subgraphs.map(
                  routingSubgraph => routingSubgraph.subgraph.systemId,
                ),
              topology: context.input.manualTopology,
            },
          ];

    for (const expansionInput of expansionInputs) {
      const pathExpansion =
        expansionInput.kind === ROUTING_MODE.Auto
          ? expandPath(expansionInput.path, context.kvResolutions.perSg)
          : expandSubgraphCombinations(
              expansionInput.memberSubgraphSystemIds,
              context.kvResolutions.perSg,
            );
      if (
        pathExpansion.validAssignments.length === 0 &&
        pathExpansion.conflicts.length > 0
      ) {
        conflictingPathDetails.push({
          pathSubgraphSystemIds: expansionInput.memberSubgraphSystemIds,
          conflicts: pathExpansion.conflicts,
        });
        continue;
      }
      for (const sgkvAssignment of pathExpansion.validAssignments) {
        const gkv = aggregateGkv(sgkvAssignment);
        if (gkv.length === 0) continue;
        if (expansionInput.kind === ROUTING_MODE.Manual) {
          manualCandidates.push({
            kind: USECASE_CANDIDATE_KIND.Manual,
            memberSubgraphSystemIds: expansionInput.memberSubgraphSystemIds,
            topology: expansionInput.topology,
            sgkvAssignment,
            gkv,
          });
        } else {
          automaticCandidates.push({
            kind: USECASE_CANDIDATE_KIND.Auto,
            path: expansionInput.path,
            sgkvAssignment,
            gkv,
          });
        }
      }
    }

    if (conflictingPathDetails.length > 0) {
      return Result.fail(
        ...conflictingPathDetails.map(details =>
          RoutingIssueFactory.noValidCombination(details),
        ),
      );
    }
    context.usecaseCandidates.automaticCandidates.push(...automaticCandidates);
    context.usecaseCandidates.manualCandidates.push(...manualCandidates);
    return Result.ok();
  }
}
