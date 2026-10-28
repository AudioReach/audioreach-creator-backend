/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import {Result} from '../../../shared/result/result.js';
import type {
  ManualTopology,
  ManualTopologyPair,
} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {DirectedCycleDetector} from '../shared/directed-cycle-detector.js';

/**
 * Groups the snapshot's routable data and control links into ManualTopology pairs,
 * identifies isolated subgraphs (those not an endpoint of any pair), then runs
 * directed-cycle detection.
 *
 * Receives the pre-filtered collections from RoutingGraphSnapshot — no DB access needed.
 * Scope and existence validation is already handled by RoutingGraphSnapshotBuilder.
 *
 * A pair with both data and control links retains both: data links set the directed
 * pair relationship; control links are additional support on the same pair.
 *
 * Isolated subgraphs — active subgraphs that are not an endpoint of any pair — are
 * tracked in `ManualTopology.isolatedSubgraphSystemIds` and produce single-member
 * island usecases in Phase 8.
 */
export function assembleManualTopology(
  routableDataLinks: readonly DataLink[],
  routableControlLinks: readonly ControlLink[],
  activeSubgraphSystemIds: readonly number[],
): Result<ManualTopology> {
  // Pass 1 — group data links by directed pair key.
  const dataByKey = new Map<
    string,
    {src: number; dst: number; dl: DataLink[]}
  >();
  for (const link of routableDataLinks) {
    const key = `${link.sourceSubgraphSystemId}:${link.destSubgraphSystemId}`;
    const e = dataByKey.get(key) ?? {
      src: link.sourceSubgraphSystemId,
      dst: link.destSubgraphSystemId,
      dl: [],
    };
    e.dl.push(link);
    dataByKey.set(key, e);
  }

  // Pass 2 — group control links by canonical (sorted) pair key.
  // Control links are undirected; canonical key is always min:max.
  const controlByKey = new Map<string, ControlLink[]>();
  for (const link of routableControlLinks) {
    const [a, b] = [
      link.sourceSubgraphSystemId,
      link.destSubgraphSystemId,
    ].sort((x, y) => x - y);
    const key = `${a}:${b}`;
    const cl = controlByKey.get(key) ?? [];
    cl.push(link);
    controlByKey.set(key, cl);
  }

  // Pass 3 — build pairs, merging data and control links that share the same
  // unordered subgraph pair. Data direction is authoritative; control links on
  // the same unordered pair attach as additional support.
  const pairs: ManualTopologyPair[] = [];

  for (const {src, dst, dl} of dataByKey.values()) {
    const [a, b] = [src, dst].sort((x, y) => x - y);
    const canonicalKey = `${a}:${b}`;
    const cl = controlByKey.get(canonicalKey) ?? [];
    controlByKey.delete(canonicalKey); // consumed — won't create a duplicate control-only pair
    pairs.push(
      buildManualTopologyPair(
        {sourceSubgraphSystemId: src, destSubgraphSystemId: dst},
        dl,
        cl,
      ),
    );
  }

  // Remaining entries are control-only pairs (no data link on that subgraph pair).
  for (const [key, cl] of controlByKey) {
    const [src, dst] = key.split(':').map(Number);
    pairs.push(
      buildManualTopologyPair(
        {sourceSubgraphSystemId: src, destSubgraphSystemId: dst},
        [],
        cl,
      ),
    );
  }

  const cycle = new DirectedCycleDetector().findCycle(pairs);
  if (cycle !== null)
    return Result.fail(RoutingIssueFactory.manualCycleDetected(cycle));

  const pairedSgIds = new Set<number>();
  for (const p of pairs) {
    pairedSgIds.add(p.pair.sourceSubgraphSystemId);
    pairedSgIds.add(p.pair.destSubgraphSystemId);
  }
  const isolatedSubgraphSystemIds = activeSubgraphSystemIds.filter(
    id => !pairedSgIds.has(id),
  );

  return Result.ok({pairs, isolatedSubgraphSystemIds});
}

/**
 * Builds an immutable ManualTopologyPair.
 *
 * - Data-supported pairs: data links must be non-empty and all match the directed
 *   pair endpoints. Control links are optional additional support; each must match
 *   the pair's unordered endpoint set (either direction).
 * - Control-only pairs: control links must be non-empty, match the pair endpoints,
 *   and the pair must be in canonical order (sourceId < destId) since there is no
 *   data link to establish direction.
 */
function buildManualTopologyPair(
  pair: SubgraphPair,
  dataLinks: readonly DataLink[],
  controlLinks: readonly ControlLink[],
): ManualTopologyPair {
  if (dataLinks.length === 0 && controlLinks.length === 0)
    throw new Error(
      'Manual topology pair must have at least one data or control link',
    );

  if (dataLinks.length > 0) {
    if (
      dataLinks.some(
        link =>
          link.sourceSubgraphSystemId !== pair.sourceSubgraphSystemId ||
          link.destSubgraphSystemId !== pair.destSubgraphSystemId,
      )
    )
      throw new Error(
        'Manual data topology support must match the directed pair',
      );
  } else {
    // Control-only: canonical order required (no data direction to anchor to).
    if (pair.sourceSubgraphSystemId > pair.destSubgraphSystemId)
      throw new Error(
        'Control-only manual topology pair must be in canonical order (sourceId < destId)',
      );
  }

  if (
    controlLinks.some(
      link =>
        !(
          (link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
            link.destSubgraphSystemId === pair.destSubgraphSystemId) ||
          (link.sourceSubgraphSystemId === pair.destSubgraphSystemId &&
            link.destSubgraphSystemId === pair.sourceSubgraphSystemId)
        ),
    )
  )
    throw new Error(
      'Manual control topology support must match the pair endpoints (either direction)',
    );

  return Object.freeze({
    pair: Object.freeze({...pair}),
    dataLinks: Object.freeze([...dataLinks]),
    controlLinks: Object.freeze([...controlLinks]),
  });
}
