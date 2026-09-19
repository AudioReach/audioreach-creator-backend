/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Result,
  type Result as ResultType,
} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {
  DfsPath,
  RoutingCombination,
  SgkvInstance,
} from '../contracts/routing-state.js';
import {PATH_TERMINATION} from '../contracts/routing-state.js';
import {
  RoutingIssueFactory,
  type RoutingCombinationConflict,
  type RoutingCombinationConflictDetails,
} from '../issues/routing-issue-factory.js';

interface PathExpansion {
  readonly validAssignments: readonly ReadonlyMap<number, SgkvInstance>[];
  readonly conflicts: readonly RoutingCombinationConflict[];
}

/** Deduplicates identical Key/Value pairs and returns a stable GKV ordering. */
function aggregateGkv(
  sgkvAssignment: ReadonlyMap<number, SgkvInstance>,
): readonly {keyDefSystemId: number; valueDefSystemId: number}[] {
  const uniqueKeyValuePairs = new Map<
    string,
    {keyDefSystemId: number; valueDefSystemId: number}
  >();
  for (const sgkvInstance of sgkvAssignment.values()) {
    for (const keyValuePair of sgkvInstance.keyValues) {
      uniqueKeyValuePairs.set(
        `${keyValuePair.keyDefSystemId}:${keyValuePair.valueDefSystemId}`,
        keyValuePair,
      );
    }
  }
  return [...uniqueKeyValuePairs.values()].sort(
    (leftKeyValuePair, rightKeyValuePair) =>
      leftKeyValuePair.keyDefSystemId - rightKeyValuePair.keyDefSystemId ||
      leftKeyValuePair.valueDefSystemId - rightKeyValuePair.valueDefSystemId,
  );
}

function expandPath(
  path: DfsPath,
  perSg: ReadonlyMap<number, readonly SgkvInstance[]>,
): PathExpansion {
  const pathSubgraphSystemIds = path.subgraphSystemIds;
  const validAssignments: ReadonlyMap<number, SgkvInstance>[] = [];
  const conflicts: RoutingCombinationConflict[] = [];
  const currentAssignment = new Map<number, SgkvInstance>();
  const assignedValueByKeyId = new Map<number, number>();
  const contributorsByKeyAndValue = new Map<number, Map<number, Set<number>>>();

  // These maps represent one DFS branch. Each option records the state it adds
  // so that the state can be removed exactly when backtracking from that option.
  // eslint-disable-next-line sonarjs/cognitive-complexity -- The local DFS state is intentionally explicit for early pruning and exact backtracking.
  const visit = (subgraphIndex: number): void => {
    if (subgraphIndex === pathSubgraphSystemIds.length) {
      validAssignments.push(new Map(currentAssignment));
      return;
    }

    const subgraphSystemId = pathSubgraphSystemIds[subgraphIndex];
    const sgkvOptions = perSg.get(subgraphSystemId) ?? [{keyValues: []}];
    for (const sgkvOption of sgkvOptions) {
      const optionValueByKeyId = new Map<number, number>();
      let optionHasConflict = false;
      // Check the whole option before mutating branch state, enabling early pruning.
      for (const keyValuePair of sgkvOption.keyValues) {
        const optionValue = optionValueByKeyId.get(keyValuePair.keyDefSystemId);
        if (
          optionValue !== undefined &&
          optionValue !== keyValuePair.valueDefSystemId
        ) {
          optionHasConflict = true;
          conflicts.push({
            keyDefSystemId: keyValuePair.keyDefSystemId,
            conflictingSubgraphSystemIds: [subgraphSystemId, subgraphSystemId],
          });
          continue;
        }
        optionValueByKeyId.set(
          keyValuePair.keyDefSystemId,
          keyValuePair.valueDefSystemId,
        );
        const assignedValue = assignedValueByKeyId.get(
          keyValuePair.keyDefSystemId,
        );
        if (
          assignedValue !== undefined &&
          assignedValue !== keyValuePair.valueDefSystemId
        ) {
          optionHasConflict = true;
          const contributorsByValue = contributorsByKeyAndValue.get(
            keyValuePair.keyDefSystemId,
          );
          const priorSubgraphIds =
            contributorsByValue?.get(assignedValue) ?? [];
          for (const priorSubgraphSystemId of priorSubgraphIds) {
            conflicts.push({
              keyDefSystemId: keyValuePair.keyDefSystemId,
              conflictingSubgraphSystemIds: [
                subgraphSystemId,
                priorSubgraphSystemId,
              ],
            });
          }
        }
      }
      if (optionHasConflict) continue;

      // Add this option's values to the branch and remember the entries that
      // need to be removed after its descendants have been explored.
      const newlyAssignedKeyIds: number[] = [];
      const keysWithAddedContributor: number[] = [];
      for (const [keyDefSystemId, valueDefSystemId] of optionValueByKeyId) {
        if (!assignedValueByKeyId.has(keyDefSystemId)) {
          assignedValueByKeyId.set(keyDefSystemId, valueDefSystemId);
          contributorsByKeyAndValue.set(
            keyDefSystemId,
            new Map([[valueDefSystemId, new Set([subgraphSystemId])]]),
          );
          newlyAssignedKeyIds.push(keyDefSystemId);
          continue;
        }
        const contributorsByValue =
          contributorsByKeyAndValue.get(keyDefSystemId)!;
        const contributingSubgraphIds =
          contributorsByValue.get(valueDefSystemId) ?? new Set<number>();
        if (contributingSubgraphIds.size === 0) {
          contributorsByValue.set(valueDefSystemId, contributingSubgraphIds);
        }
        contributingSubgraphIds.add(subgraphSystemId);
        keysWithAddedContributor.push(keyDefSystemId);
      }
      currentAssignment.set(subgraphSystemId, sgkvOption);
      visit(subgraphIndex + 1);
      currentAssignment.delete(subgraphSystemId);

      // Backtrack the branch-local value and contributor state before trying
      // the next SGKV option for this subgraph.
      for (const keyDefSystemId of keysWithAddedContributor) {
        const contributorsByValue =
          contributorsByKeyAndValue.get(keyDefSystemId)!;
        const valueDefSystemId = optionValueByKeyId.get(keyDefSystemId)!;
        const contributingSubgraphIds =
          contributorsByValue.get(valueDefSystemId)!;
        contributingSubgraphIds.delete(subgraphSystemId);
        if (contributingSubgraphIds.size === 0) {
          contributorsByValue.delete(valueDefSystemId);
        }
      }
      for (const keyDefSystemId of newlyAssignedKeyIds) {
        contributorsByKeyAndValue.delete(keyDefSystemId);
        assignedValueByKeyId.delete(keyDefSystemId);
      }
    }
  };

  visit(0);
  return {validAssignments, conflicts};
}

function syntheticManualPath(context: RoutingContext): DfsPath {
  return {
    subgraphSystemIds: context.input.graphSnapshot.subgraphs.map(
      routingSubgraph => routingSubgraph.subgraph.systemId,
    ),
    termination: PATH_TERMINATION.NaturalLeaf,
    ecBoundaryLinkId: null,
  };
}

export class CombinationExpansionService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase execution remains promise-based for ordered orchestration.
  async run(context: RoutingContext): Promise<ResultType<void>> {
    if (!context.kvResolutions) {
      throw new Error(
        'CombinationExpansionService requires Phase 4 KV resolutions',
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
