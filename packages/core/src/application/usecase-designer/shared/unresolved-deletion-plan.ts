/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type ClassifiedUnresolvedChain = {
  segmentSystemIds: readonly number[];
  nodeSystemIds: readonly number[];
};

export type UnresolvedChainClassification = {
  completeChains: readonly ClassifiedUnresolvedChain[];
  incompleteChains: readonly ClassifiedUnresolvedChain[];
};

export type UnresolvedDeletionPlan = {
  fullModeIds: number[];
  segmentOnlyIds: number[];
};

export type UnresolvedDeletionPlanInput<TSegment> = {
  moduleSystemId: number;
  /** Unresolved segments found by BFS from the deleted module. */
  reachableSegments: readonly TSegment[];
  /** Every effective subsystem segment in the file. */
  routeSegments: readonly TSegment[];
  getSystemId: (segment: TSegment) => number;
  isUnresolved: (segment: TSegment) => boolean;
  getNodeSystemIds: (segment: TSegment) => readonly number[];
  classify: (
    unresolvedSegments: readonly TSegment[],
  ) => UnresolvedChainClassification;
};

export function planUnresolvedDeletion<TSegment>(
  input: UnresolvedDeletionPlanInput<TSegment>,
): UnresolvedDeletionPlan {
  // `reachableSegments` is the node-level BFS result from the deleted module.
  // It contains every unresolved segment in that connected component, not only
  // segments that belong to a complete module-to-module chain.
  const reachableIds = new Set(
    input.reachableSegments.map(segment => input.getSystemId(segment)),
  );
  const unresolvedSegments = input.routeSegments.filter(segment =>
    input.isUnresolved(segment),
  );
  const segmentById = new Map(
    unresolvedSegments.map(segment => [input.getSystemId(segment), segment]),
  );
  const resolution = input.classify(unresolvedSegments);
  const completeIds = new Set(
    resolution.completeChains
      .filter(chain => chain.nodeSystemIds.includes(input.moduleSystemId))
      .flatMap(chain => chain.segmentSystemIds)
      .filter(systemId => reachableIds.has(systemId)),
  );
  const fallbackIds = new Set(
    resolution.incompleteChains
      .filter(chain => chain.nodeSystemIds.includes(input.moduleSystemId))
      .flatMap(chain => chain.segmentSystemIds)
      .filter(systemId => reachableIds.has(systemId)),
  );

  // Segment-only deletion is safe only for complete chains. If a reachable
  // chain is incomplete or cannot be classified, delete its entire BFS
  // reachable chain in either mode rather than leaving a broken fragment.
  for (const systemId of reachableIds) {
    if (!completeIds.has(systemId)) fallbackIds.add(systemId);
  }

  // segmentOnlyIds = module-incident IDs from complete chains
  //                + all IDs from incomplete or unclassified chains.
  const segmentOnlyIds = new Set(fallbackIds);
  for (const systemId of completeIds) {
    const segment = segmentById.get(systemId);
    if (
      segment &&
      !fallbackIds.has(systemId) &&
      input.getNodeSystemIds(segment).includes(input.moduleSystemId)
    ) {
      segmentOnlyIds.add(systemId);
    }
  }

  return {
    fullModeIds: sortIds(reachableIds),
    segmentOnlyIds: sortIds(segmentOnlyIds),
  };
}

export function sortIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}
