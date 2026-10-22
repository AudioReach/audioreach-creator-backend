/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {Issue} from '../../../../../shared/issues/issue.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {
  ROUTING_MODE,
  type AutoRoutingInput,
} from '../../contracts/routing-input.js';
import {
  PATH_TERMINATION,
  type AutoUsecaseCandidate,
  type DfsPath,
  type EcBridgeUsecaseCandidate,
  type KvResolutions,
  type ManualUsecaseCandidate,
  USECASE_CANDIDATE_KIND,
} from '../../contracts/routing-state.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
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
import {
  deriveControlLinkPairs,
  type ControlLinkPairScope,
} from './control-link-pairs.js';
import {logicalEcConnections} from '../../shared/logical-ec-connections.js';
import {preExistingUsecases} from '../../shared/projected-usecase-topology.js';
import {unorderedPairKeyOf} from '../../shared/usecase-topology.js';

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

function pathEdges(path: DfsPath): readonly SubgraphPair[] {
  const pairs: SubgraphPair[] = [];
  for (let index = 1; index < path.subgraphSystemIds.length; index += 1) {
    pairs.push({
      sourceSubgraphSystemId: path.subgraphSystemIds[index - 1],
      destSubgraphSystemId: path.subgraphSystemIds[index],
    });
  }
  return pairs;
}

function buildControlLinkPairScope(
  context: RoutingContext,
): ControlLinkPairScope {
  const preExistingUnorderedPairKeys = new Set<string>();
  for (const usecase of preExistingUsecases(context)) {
    for (const pair of usecase.subgraphPairs)
      preExistingUnorderedPairKeys.add(unorderedPairKeyOf(pair));
  }
  return {
    eligibleControlLinks: context.input.graphSnapshot.routableControlLinks,
    preExistingUnorderedPairKeys,
  };
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

function expandAutomaticPaths(
  paths: readonly DfsPath[],
  perSg: KvResolutions['perSg'],
  scope: ControlLinkPairScope,
) {
  const conflicts: UsecaseCandidateConflictDetails[] = [];
  const candidates: AutoUsecaseCandidate[] = [];
  for (const path of paths) {
    const outcome = resolveExpansion(
      expandPath(path, perSg),
      path.subgraphSystemIds,
    );
    if (outcome.conflict) {
      conflicts.push(outcome.conflict);
      continue;
    }
    for (const {sgkvAssignment, gkv} of outcome.assignments) {
      candidates.push({
        kind: USECASE_CANDIDATE_KIND.Auto,
        path,
        sgkvAssignment,
        gkv,
        controlLinkPairs: deriveControlLinkPairs(
          path.subgraphSystemIds,
          pathEdges(path),
          scope,
        ),
      });
    }
  }
  return {candidates, conflicts};
}

function expandEcBridges(
  input: AutoRoutingInput,
  paths: readonly DfsPath[],
  perSg: KvResolutions['perSg'],
  scope: ControlLinkPairScope,
) {
  const connectionsById = new Map(
    logicalEcConnections(
      input.graphSnapshot.routableDataLinks,
      input.graphSnapshot.mdf.effective,
    ).map(connection => [
      connection.representativeDataLinkSystemId,
      connection,
    ]),
  );
  const candidates: EcBridgeUsecaseCandidate[] = [];
  const issues: Issue[] = [];
  const expandedConnectionIds = new Set<number>();
  for (const boundaryPath of paths) {
    if (boundaryPath.termination !== PATH_TERMINATION.EcBoundary) continue;
    const connectionId = boundaryPath.ecBoundaryLinkId;
    if (connectionId === null)
      throw new Error('An EC-boundary path requires an EC connection ID');
    if (expandedConnectionIds.has(connectionId)) continue;
    expandedConnectionIds.add(connectionId);
    const connection = connectionsById.get(connectionId);
    if (!connection)
      throw new Error(
        `EC connection ${connectionId} is absent from the routing snapshot`,
      );
    const bridgePath = {
      subgraphSystemIds: connection.subgraphSystemIds,
      termination: PATH_TERMINATION.NaturalLeaf,
      ecBoundaryLinkId: null,
    } as const;
    const outcome = resolveExpansion(
      expandPath(bridgePath, perSg),
      bridgePath.subgraphSystemIds,
    );
    if (outcome.conflict) {
      // The complete Bridge owns the EC connection's physical pair coverage. Publishing
      // Left/Right candidates without it would leave that topology orphaned.
      issues.push(
        RoutingIssueFactory.ecBridgeIncompatible(
          connection.representativeDataLinkSystemId,
          connection.subgraphSystemIds,
          connection.dataLinkSystemIds,
          outcome.conflict,
        ),
      );
      continue;
    }
    for (const {sgkvAssignment, gkv} of outcome.assignments) {
      candidates.push({
        kind: USECASE_CANDIDATE_KIND.EcBridge,
        representativeDataLinkSystemId:
          connection.representativeDataLinkSystemId,
        dataLinkSystemIds: connection.dataLinkSystemIds,
        path: bridgePath,
        sgkvAssignment,
        gkv,
        controlLinkPairs: deriveControlLinkPairs(
          bridgePath.subgraphSystemIds,
          pathEdges(bridgePath),
          scope,
        ),
      });
    }
  }
  return {candidates, issues};
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
      const scope = buildControlLinkPairScope(context);
      const pathExpansion = expandAutomaticPaths(
        context.dfsPaths,
        perSg,
        scope,
      );
      if (pathExpansion.conflicts.length > 0) {
        return Result.fail(
          ...pathExpansion.conflicts.map(details =>
            RoutingIssueFactory.noValidCombination(details),
          ),
        );
      }
      const bridgeExpansion = expandEcBridges(
        input,
        context.dfsPaths,
        perSg,
        scope,
      );
      if (bridgeExpansion.issues.length > 0) {
        return Result.fail(...bridgeExpansion.issues);
      }
      context.usecaseCandidates.automaticCandidates.push(
        ...pathExpansion.candidates,
      );
      context.usecaseCandidates.ecBridgeCandidates.push(
        ...bridgeExpansion.candidates,
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
        controlLinkPairs: input.manualTopology.pairs
          .filter(
            item => item.dataLinks.length === 0 && item.controlLinks.length > 0,
          )
          .map(item => item.pair),
      }),
    );
    context.usecaseCandidates.manualCandidates.push(...manualCandidates);
    return Result.ok();
  }
}
