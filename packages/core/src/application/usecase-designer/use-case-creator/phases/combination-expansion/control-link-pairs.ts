/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Derives the canonical pairs that record eligible intra-usecase control links
 * between a candidate's members.
 *
 * Control links never participate in route discovery. A pair is emitted only
 * when no data-link pair and no pre-existing UseCase already covers the same
 * unordered endpoints.
 */
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import {
  unorderedPairKey,
  unorderedPairKeyOf,
} from '../../shared/usecase-topology.js';

export interface ControlLinkPairScope {
  /**
   * `graphSnapshot.routableControlLinks`, which is already restricted to links
   * whose endpoints are both in the effective scope and which are not excluded
   * by the request.
   */
  readonly eligibleControlLinks: readonly ControlLink[];
  /**
   * Unordered pair keys owned by pre-existing effective UseCases. Excludes
   * UseCases created by the current routing run, so GKV variants of one route
   * never suppress one another.
   */
  readonly preExistingUnorderedPairKeys: ReadonlySet<string>;
}

export function deriveControlLinkPairs(
  memberSubgraphSystemIds: readonly number[],
  dataLinkPairs: readonly SubgraphPair[],
  scope: ControlLinkPairScope,
): readonly SubgraphPair[] {
  const members = new Set(memberSubgraphSystemIds);
  const covered = new Set(dataLinkPairs.map(pair => unorderedPairKeyOf(pair)));
  const emitted = new Map<string, SubgraphPair>();

  for (const link of scope.eligibleControlLinks) {
    const {sourceSubgraphSystemId: source, destSubgraphSystemId: dest} = link;
    if (!members.has(source) || !members.has(dest)) continue;
    const key = unorderedPairKey(source, dest);
    if (covered.has(key)) continue;
    if (scope.preExistingUnorderedPairKeys.has(key)) continue;
    if (emitted.has(key)) continue;
    // Control-link direction carries no domain semantics, so the pair is stored
    // in canonical ascending order.
    emitted.set(key, {
      sourceSubgraphSystemId: Math.min(source, dest),
      destSubgraphSystemId: Math.max(source, dest),
    });
  }

  return [...emitted.values()].sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
}
