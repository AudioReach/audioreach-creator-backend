/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UsecaseRepository} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

/**
 * Returns subgraphs reachable through use cases that have GKV values.
 * The starting subgraph is included in the result.
 */
export async function findReachableSubgraphIds(
  startSubgraphId: number,
  fileSystemId: number,
  usecaseRepository: UsecaseRepository,
): Promise<Set<number>> {
  const visited = new Set<number>([startSubgraphId]);
  let frontier = [startSubgraphId];

  while (frontier.length > 0) {
    const usecaseBatches = await Promise.all(
      frontier.map(subgraphSystemId =>
        usecaseRepository.findBySubgraph(fileSystemId, subgraphSystemId),
      ),
    );
    const usecases = usecaseBatches.flat();
    const linked = new Set<number>();

    for (const usecase of usecases) {
      if (usecase.keyVector.valueSystemIds.length === 0) continue;
      for (const subgraphSystemId of usecase.subgraphSystemIds) {
        if (!visited.has(subgraphSystemId)) linked.add(subgraphSystemId);
      }
    }

    frontier = [...linked];
    for (const subgraphSystemId of frontier) visited.add(subgraphSystemId);
  }

  return visited;
}
