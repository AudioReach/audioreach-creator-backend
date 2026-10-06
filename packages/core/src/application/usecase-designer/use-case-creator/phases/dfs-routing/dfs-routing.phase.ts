/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type DfsPath,
  type DeleteOrReconstructDecision,
} from '../../contracts/routing-state.js';
import type {Issue} from '../../../../../shared/issues/issue.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import {
  DfsPathTraverser,
  type DfsTraversalState,
} from './dfs-path-traverser.js';

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

/**
 * Discovers bounded automatic routing paths inside the computed cones.
 *
 * Manual routing bypasses this phase because its topology is explicit. Automatic routing
 * records deterministic cycle and EC-boundary outcomes and supplies successor paths for
 * eligible deletion decisions.
 */
export class DfsRoutingPhase {
  constructor(
    private readonly dfsPathTraverser: DfsPathTraverser = new DfsPathTraverser(),
  ) {}

  run(context: RoutingContext): Result<void> {
    if (context.input.mode === ROUTING_MODE.Manual) return Result.ok();
    if (!context.cones) {
      throw new Error(
        'DfsRoutingPhase requires Phase 6 cones in automatic mode',
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
        dataLink.linkType !== DATA_LINK_TYPE.Normal ||
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

    const traversal: DfsTraversalState = {
      outgoingNeighbors,
      coveredSubgraphIds: new Set<number>(),
      discoveredPaths,
      cycleWarnings,
    };

    const rootSubgraphIds = [...context.cones.rootSgs]
      .filter(subgraphSystemId => coneSubgraphSystemIds.has(subgraphSystemId))
      .sort(
        (leftSubgraphSystemId, rightSubgraphSystemId) =>
          leftSubgraphSystemId - rightSubgraphSystemId,
      );
    for (const rootSubgraphId of rootSubgraphIds) {
      if (!traversal.coveredSubgraphIds.has(rootSubgraphId)) {
        this.dfsPathTraverser.traverse(
          traversal,
          rootSubgraphId,
          [rootSubgraphId],
          new Set([rootSubgraphId]),
        );
      }
    }

    // A pure cycle has no root. Start each remaining weak component at its lowest ID.
    while (true) {
      const uncoveredSubgraphIds = [...coneSubgraphSystemIds]
        .filter(subgraphId => !traversal.coveredSubgraphIds.has(subgraphId))
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
        .filter(subgraphId => !traversal.coveredSubgraphIds.has(subgraphId))
        .sort(
          (leftSubgraphSystemId, rightSubgraphSystemId) =>
            leftSubgraphSystemId - rightSubgraphSystemId,
        )[0];
      this.dfsPathTraverser.traverse(
        traversal,
        componentStartSubgraphId,
        [componentStartSubgraphId],
        new Set([componentStartSubgraphId]),
      );
    }

    // Reconstruction paths are already computed by Phase 2; Phase 7 only orders
    // and appends them after newly discovered snapshot paths.
    const analysis = context.topologyChangeAnalysis;
    if (analysis === null) {
      throw new Error('Topology change analysis must run before DFS');
    }
    const orderedReconstructionPaths = analysis.decisions
      .filter(
        (decision): decision is DeleteOrReconstructDecision =>
          decision.kind === USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      )
      .flatMap(decision =>
        decision.reconstructionPaths.map(path => ({
          originalUsecaseSystemId: decision.usecase.systemId,
          path,
        })),
      )
      .sort(
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
