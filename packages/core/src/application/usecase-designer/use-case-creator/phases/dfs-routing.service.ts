/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import {PATH_TERMINATION, type DfsPath} from '../contracts/routing-state.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {LINK_TYPE} from '../../../../domain/entities/usecase-data/links/link-type.js';
import type {Issue} from '../../../../shared/issues/issue.js';

/** Compares two SG paths lexicographically for stable reconstruction ordering. */
function comparePathIds(
  leftPathIds: readonly number[],
  rightPathIds: readonly number[],
): number {
  const comparedLength = Math.min(leftPathIds.length, rightPathIds.length);
  for (let pathIndex = 0; pathIndex < comparedLength; pathIndex += 1) {
    const difference = leftPathIds[pathIndex] - rightPathIds[pathIndex];
    if (difference !== 0) return difference;
  }
  return leftPathIds.length - rightPathIds.length;
}

/** Collects a weakly connected component using both graph directions. */
function collectComponent(
  startSubgraphSystemId: number,
  outgoingNeighbors: ReadonlyMap<number, readonly number[]>,
  incomingNeighbors: ReadonlyMap<number, readonly number[]>,
): Set<number> {
  const componentSubgraphIds = new Set<number>();
  const pendingSubgraphIds = [startSubgraphSystemId];
  while (pendingSubgraphIds.length > 0) {
    const currentSubgraphSystemId = pendingSubgraphIds.pop()!;
    if (componentSubgraphIds.has(currentSubgraphSystemId)) continue;
    componentSubgraphIds.add(currentSubgraphSystemId);
    pendingSubgraphIds.push(
      ...(outgoingNeighbors.get(currentSubgraphSystemId) ?? []),
      ...(incomingNeighbors.get(currentSubgraphSystemId) ?? []),
    );
  }
  return componentSubgraphIds;
}

export class DfsRoutingService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase execution remains promise-based for ordered orchestration.
  async run(
    context: RoutingContext,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    if (context.input.mode === ROUTING_MODE.Manual) return Result.ok();
    if (!context.cones) {
      throw new Error(
        'DfsRoutingService requires Phase 6 cones in automatic mode',
      );
    }

    const discoveredPaths: DfsPath[] = [];
    const cycleWarnings: Issue[] = [];
    const coneSubgraphSystemIds = new Set(context.cones.sgSystemIds);
    const outgoingNeighborSets = new Map<number, Set<number>>();
    const incomingNeighborSets = new Map<number, Set<number>>();
    for (const subgraphSystemId of coneSubgraphSystemIds) {
      outgoingNeighborSets.set(subgraphSystemId, new Set());
      incomingNeighborSets.set(subgraphSystemId, new Set());
    }
    // Build topology from the immutable snapshot. Phase 7 must not reload graph state.
    for (const dataLink of context.input.graphSnapshot.routableDataLinks) {
      if (
        dataLink.linkType !== LINK_TYPE.IntraUsecase ||
        !coneSubgraphSystemIds.has(dataLink.sourceSubgraphSystemId) ||
        !coneSubgraphSystemIds.has(dataLink.destSubgraphSystemId)
      ) {
        continue;
      }
      outgoingNeighborSets
        .get(dataLink.sourceSubgraphSystemId)!
        .add(dataLink.destSubgraphSystemId);
      incomingNeighborSets
        .get(dataLink.destSubgraphSystemId)!
        .add(dataLink.sourceSubgraphSystemId);
    }
    const outgoingNeighbors = new Map<number, readonly number[]>();
    const incomingNeighbors = new Map<number, readonly number[]>();
    for (const [subgraphSystemId, neighborIds] of outgoingNeighborSets) {
      outgoingNeighbors.set(
        subgraphSystemId,
        [...neighborIds].sort(
          (leftSubgraphSystemId, rightSubgraphSystemId) =>
            leftSubgraphSystemId - rightSubgraphSystemId,
        ),
      );
    }
    for (const [subgraphSystemId, neighborIds] of incomingNeighborSets) {
      incomingNeighbors.set(
        subgraphSystemId,
        [...neighborIds].sort(
          (leftSubgraphSystemId, rightSubgraphSystemId) =>
            leftSubgraphSystemId - rightSubgraphSystemId,
        ),
      );
    }

    // `covered` is only for rootless-component discovery. `activePathSubgraphIds`
    // remains branch-local so shared downstream nodes still produce every path.
    const coveredSubgraphIds = new Set<number>();
    // The active set belongs to one branch; the global covered set must not
    // suppress alternate paths through shared downstream subgraphs.
    const visit = (
      currentSubgraphSystemId: number,
      currentPath: readonly number[],
      activePathSubgraphIds: ReadonlySet<number>,
    ): void => {
      coveredSubgraphIds.add(currentSubgraphSystemId);
      const outgoingSubgraphIds =
        outgoingNeighbors.get(currentSubgraphSystemId) ?? [];
      if (outgoingSubgraphIds.length === 0) {
        if (currentPath.length >= 2) {
          discoveredPaths.push({
            subgraphSystemIds: [...currentPath],
            termination: PATH_TERMINATION.NaturalLeaf,
            ecBoundaryLinkId: null,
          });
        }
        return;
      }
      for (const nextSubgraphSystemId of outgoingSubgraphIds) {
        if (activePathSubgraphIds.has(nextSubgraphSystemId)) {
          discoveredPaths.push({
            subgraphSystemIds: [...currentPath],
            termination: PATH_TERMINATION.Cycle,
            ecBoundaryLinkId: null,
          });
          cycleWarnings.push(
            RoutingIssueFactory.cycleDetected(nextSubgraphSystemId),
          );
          continue;
        }
        const nextActivePathSubgraphIds = new Set(activePathSubgraphIds);
        nextActivePathSubgraphIds.add(nextSubgraphSystemId);
        visit(
          nextSubgraphSystemId,
          [...currentPath, nextSubgraphSystemId],
          nextActivePathSubgraphIds,
        );
      }
    };

    const rootSubgraphIds = [...context.cones.rootSgs]
      .filter(subgraphSystemId => coneSubgraphSystemIds.has(subgraphSystemId))
      .sort(
        (leftSubgraphSystemId, rightSubgraphSystemId) =>
          leftSubgraphSystemId - rightSubgraphSystemId,
      );
    for (const rootSubgraphId of rootSubgraphIds) {
      if (!coveredSubgraphIds.has(rootSubgraphId)) {
        visit(rootSubgraphId, [rootSubgraphId], new Set([rootSubgraphId]));
      }
    }

    // A pure cycle has no root. Start each remaining weak component at its lowest ID.
    while (true) {
      const uncoveredSubgraphIds = [...coneSubgraphSystemIds]
        .filter(subgraphId => !coveredSubgraphIds.has(subgraphId))
        .sort(
          (leftSubgraphSystemId, rightSubgraphSystemId) =>
            leftSubgraphSystemId - rightSubgraphSystemId,
        );
      if (uncoveredSubgraphIds.length === 0) break;
      const componentSubgraphIds = collectComponent(
        uncoveredSubgraphIds[0],
        outgoingNeighbors,
        incomingNeighbors,
      );
      const componentStartSubgraphId = [...componentSubgraphIds]
        .filter(subgraphId => !coveredSubgraphIds.has(subgraphId))
        .sort(
          (leftSubgraphSystemId, rightSubgraphSystemId) =>
            leftSubgraphSystemId - rightSubgraphSystemId,
        )[0];
      visit(
        componentStartSubgraphId,
        [componentStartSubgraphId],
        new Set([componentStartSubgraphId]),
      );
    }

    // Reconstruction paths are already computed by Phase 2; Phase 7 only orders
    // and appends them after newly discovered snapshot paths.
    const orderedReconstructionPaths = [
      ...(context.deletionAnalysis?.reconstructionPaths ?? []),
    ].sort(
      (left, right) =>
        left.originalUsecaseSystemId - right.originalUsecaseSystemId ||
        comparePathIds(
          left.path.subgraphSystemIds,
          right.path.subgraphSystemIds,
        ),
    );
    discoveredPaths.push(
      ...orderedReconstructionPaths.map(
        reconstructionDescriptor => reconstructionDescriptor.path,
      ),
    );
    context.dfsPaths.push(...discoveredPaths);
    context.warnings.push(...cycleWarnings);
    return Result.ok();
  }
}
