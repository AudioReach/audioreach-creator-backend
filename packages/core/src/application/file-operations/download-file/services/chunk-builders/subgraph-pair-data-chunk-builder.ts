/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubgraphPairDataChunk} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {SubgraphPairEntry} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {
  DataLink,
  ControlLink,
} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {
  UsecaseDataDownloadModel,
  SubgraphPairDownloadModel,
} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

/**
 * Builds a SubgraphPairDataChunk from SCLU-typed link models stored during upload.
 *
 * The subgraph pairs to emit come from usecaseData.subgraphPairs.
 * The actual data/control links come from subgraphPairs (cross-subgraph links
 * that are not InterUsecase type, stored during upload from SubgraphPairDataChunk).
 *
 * Pairs with no data links AND no control links are omitted (matching reference behavior).
 */
export function buildSubgraphPairDataChunk(
  usecaseData: UsecaseDataDownloadModel[],
  subgraphPairs: SubgraphPairDownloadModel[],
): SubgraphPairDataChunk {
  const chunk = new SubgraphPairDataChunk();

  if (usecaseData.length === 0) return chunk;

  // Index pairs by "srcSgId:dstSgId"
  const pairsByKey = new Map<string, SubgraphPairDownloadModel>();
  for (const p of subgraphPairs) {
    pairsByKey.set(`${p.srcSubgraphNaturalId}:${p.dstSubgraphNaturalId}`, p);
  }

  // Collect unique (src, dst) pairs then sort by (srcId, dstId) ascending,
  // matching the SortedDictionary ordering used in the reference implementation.
  const seenPairs = new Set<string>();
  const uniquePairs: Array<{srcId: number; dstId: number}> = [];
  for (const uc of usecaseData) {
    for (const pair of uc.subgraphPairs) {
      const key = `${pair.sourceSubgraphNaturalId}:${pair.destSubgraphNaturalId}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        uniquePairs.push({
          srcId: pair.sourceSubgraphNaturalId,
          dstId: pair.destSubgraphNaturalId,
        });
      }
    }
  }
  uniquePairs.sort((a, b) =>
    a.srcId !== b.srcId ? a.srcId - b.srcId : a.dstId - b.dstId,
  );

  for (const {srcId, dstId} of uniquePairs) {
    const key = `${srcId}:${dstId}`;
    const revKey = `${dstId}:${srcId}`;
    // Check both directions: the stored source/dest subgraph may be swapped
    // relative to the SCLU pair direction.
    const fwd = pairsByKey.get(key);
    const rev = pairsByKey.get(revKey);

    const dataLinks: DataLink[] = [
      ...(fwd?.dataLinks.map(dl => ({
        sourceInstanceId: dl.sourceInstanceNaturalId,
        sourcePortId: dl.sourcePortNaturalId,
        destinationInstanceId: dl.destinationInstanceNaturalId,
        destinationPortId: dl.destinationPortNaturalId,
        isInterGraph: false,
      })) ?? []),
      ...(rev?.dataLinks.map(dl => ({
        sourceInstanceId: dl.sourceInstanceNaturalId,
        sourcePortId: dl.sourcePortNaturalId,
        destinationInstanceId: dl.destinationInstanceNaturalId,
        destinationPortId: dl.destinationPortNaturalId,
        isInterGraph: false,
      })) ?? []),
    ];

    const controlLinks: ControlLink[] = [
      ...(fwd?.controlLinks.map(cl => ({
        peer1InstanceId: cl.peer1InstanceNaturalId,
        peer1PortId: cl.peer1PortNaturalId,
        peer2InstanceId: cl.peer2InstanceNaturalId,
        peer2PortId: cl.peer2PortNaturalId,
        isInterGraph: false,
        heapId: cl.heapId ?? 1,
        intents: cl.intentIds,
      })) ?? []),
      ...(rev?.controlLinks.map(cl => ({
        peer1InstanceId: cl.peer1InstanceNaturalId,
        peer1PortId: cl.peer1PortNaturalId,
        peer2InstanceId: cl.peer2InstanceNaturalId,
        peer2PortId: cl.peer2PortNaturalId,
        isInterGraph: false,
        heapId: cl.heapId ?? 1,
        intents: cl.intentIds,
      })) ?? []),
    ];

    if (dataLinks.length === 0 && controlLinks.length === 0) continue;

    const entry: SubgraphPairEntry = {
      sourceSubgraphId: srcId,
      destinationSubgraphId: dstId,
      dataLinks,
      controlLinks,
    };
    chunk.subgraphPairs.push(entry);
  }

  return chunk;
}
