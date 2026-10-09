/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type Cones,
  type DfsPath,
  type DeleteOrReconstructDecision,
} from '../../contracts/routing-state.js';
import type {Issue} from '../../../../../shared/issues/issue.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import {
  DfsPathTraverser,
  type DfsTraversalEdge,
  type DfsTraversalState,
} from './dfs-path-traverser.js';
import {logicalEcConnections} from '../../shared/logical-ec-connections.js';

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

function traverseAllComponents(
  cones: Cones,
  traversal: DfsTraversalState,
  pathTraverser: DfsPathTraverser,
  outgoingNeighbors: ReadonlyMap<number, readonly number[]>,
  incomingNeighbors: ReadonlyMap<number, readonly number[]>,
): void {
  const coneSubgraphSystemIds = new Set(cones.sgSystemIds);
  const rootSubgraphIds = [...cones.rootSgs]
    .filter(subgraphSystemId => coneSubgraphSystemIds.has(subgraphSystemId))
    .sort((left, right) => left - right);
  for (const rootSubgraphId of rootSubgraphIds) {
    if (traversal.coveredSubgraphIds.has(rootSubgraphId)) continue;
    pathTraverser.traverse(
      traversal,
      rootSubgraphId,
      [rootSubgraphId],
      new Set([rootSubgraphId]),
    );
  }

  // A pure cycle has no root. Start each remaining weak component at its lowest ID.
  while (true) {
    const uncoveredSubgraphIds = [...coneSubgraphSystemIds]
      .filter(subgraphId => !traversal.coveredSubgraphIds.has(subgraphId))
      .sort((left, right) => left - right);
    if (uncoveredSubgraphIds.length === 0) return;
    const componentSubgraphIds = collectComponent(
      uncoveredSubgraphIds[0],
      outgoingNeighbors,
      incomingNeighbors,
    );
    const componentStartSubgraphId = [...componentSubgraphIds]
      .filter(subgraphId => !traversal.coveredSubgraphIds.has(subgraphId))
      .sort((left, right) => left - right)[0];
    pathTraverser.traverse(
      traversal,
      componentStartSubgraphId,
      [componentStartSubgraphId],
      new Set([componentStartSubgraphId]),
    );
  }
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
    const outgoingEdgeMaps = new Map<number, Map<string, DfsTraversalEdge>>();
    const incomingNeighborSets = new Map<number, Set<number>>();
    for (const subgraphSystemId of coneSubgraphSystemIds) {
      outgoingEdgeMaps.set(subgraphSystemId, new Map());
      incomingNeighborSets.set(subgraphSystemId, new Set());
    }
    const addEdge = (
      sourceSubgraphSystemId: number,
      edge: DfsTraversalEdge,
    ): void => {
      if (
        !coneSubgraphSystemIds.has(sourceSubgraphSystemId) ||
        !coneSubgraphSystemIds.has(edge.destSubgraphSystemId)
      ) {
        return;
      }
      const edgeKey = `${edge.ecRepresentativeDataLinkSystemId ?? 'NORMAL'}:${edge.destSubgraphSystemId}`;
      outgoingEdgeMaps.get(sourceSubgraphSystemId)!.set(edgeKey, edge);
      incomingNeighborSets
        .get(edge.destSubgraphSystemId)!
        .add(sourceSubgraphSystemId);
    };
    // Build topology from the immutable snapshot. Phase 7 must not reload graph state.
    for (const dataLink of context.input.graphSnapshot.routableDataLinks) {
      if (
        dataLink.linkType !== DATA_LINK_TYPE.Normal ||
        !coneSubgraphSystemIds.has(dataLink.sourceSubgraphSystemId) ||
        !coneSubgraphSystemIds.has(dataLink.destSubgraphSystemId)
      ) {
        continue;
      }
      addEdge(dataLink.sourceSubgraphSystemId, {
        destSubgraphSystemId: dataLink.destSubgraphSystemId,
        ecRepresentativeDataLinkSystemId: null,
      });
    }
    const logicalEcEdges = logicalEcConnections(
      context.input.graphSnapshot.routableDataLinks,
      context.input.graphSnapshot.mdfSubgraphSystemIds,
    );
    for (const connection of logicalEcEdges) {
      addEdge(connection.leftSubgraphSystemId, {
        destSubgraphSystemId: connection.rightSubgraphSystemId,
        ecRepresentativeDataLinkSystemId:
          connection.representativeDataLinkSystemId,
      });
    }
    const outgoingEdges = new Map<number, readonly DfsTraversalEdge[]>();
    const outgoingNeighbors = new Map<number, readonly number[]>();
    const incomingNeighbors = new Map<number, readonly number[]>();
    for (const [subgraphSystemId, edgeMap] of outgoingEdgeMaps) {
      const edges = [...edgeMap.values()].sort(
        (left, right) =>
          Number(left.ecRepresentativeDataLinkSystemId !== null) -
            Number(right.ecRepresentativeDataLinkSystemId !== null) ||
          left.destSubgraphSystemId - right.destSubgraphSystemId ||
          (left.ecRepresentativeDataLinkSystemId ?? 0) -
            (right.ecRepresentativeDataLinkSystemId ?? 0),
      );
      outgoingEdges.set(subgraphSystemId, edges);
      outgoingNeighbors.set(
        subgraphSystemId,
        [...new Set(edges.map(edge => edge.destSubgraphSystemId))].sort(
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
      outgoingEdges,
      coveredSubgraphIds: new Set<number>(),
      discoveredPaths,
      cycleWarnings,
      ecIssues: [],
      traversedRightSides: new Set(),
    };

    traverseAllComponents(
      context.cones,
      traversal,
      this.dfsPathTraverser,
      outgoingNeighbors,
      incomingNeighbors,
    );

    if (traversal.ecIssues.length > 0) {
      return Result.fail(...traversal.ecIssues);
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
