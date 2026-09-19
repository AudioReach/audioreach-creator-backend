/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import {LINK_TYPE} from '../../../../domain/entities/usecase-data/links/link-type.js';

export class ConeComputationService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase execution remains promise-based for ordered orchestration.
  async run(context: RoutingContext): Promise<ResultType<void>> {
    if (context.input.mode === ROUTING_MODE.Manual) return Result.ok();
    if (context.seeds === null)
      throw new Error(
        'ConeComputationService requires Phase 5 seeds in automatic mode',
      );

    const scope = new Set(
      context.input.graphSnapshot.subgraphs.map(
        entry => entry.subgraph.systemId,
      ),
    );
    const forward = new Map<number, Set<number>>();
    const reverse = new Map<number, Set<number>>();
    for (const sgSystemId of scope) {
      forward.set(sgSystemId, new Set());
      reverse.set(sgSystemId, new Set());
    }
    for (const link of context.input.graphSnapshot.routableDataLinks) {
      if (
        link.linkType !== LINK_TYPE.IntraUsecase ||
        !scope.has(link.sourceSubgraphSystemId) ||
        !scope.has(link.destSubgraphSystemId)
      ) {
        continue;
      }
      forward.get(link.sourceSubgraphSystemId)!.add(link.destSubgraphSystemId);
      reverse.get(link.destSubgraphSystemId)!.add(link.sourceSubgraphSystemId);
    }

    const queue = [...context.seeds.sgSystemIds]
      .filter(sgSystemId => scope.has(sgSystemId))
      .sort((left, right) => left - right);
    const queued = new Set(queue);
    const visited = new Set<number>();
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (visited.has(current)) continue;
      visited.add(current);
      const neighbors = [
        ...(forward.get(current) ?? []),
        ...(reverse.get(current) ?? []),
      ].sort((left, right) => left - right);
      for (const neighbor of neighbors) {
        if (!queued.has(neighbor)) {
          queued.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const coneSystemIds = [...visited].sort((left, right) => left - right);
    const cone = new Set(coneSystemIds);
    const rootSystemIds = coneSystemIds.filter(sgSystemId => {
      const hasIncomingConeEdge = [...(reverse.get(sgSystemId) ?? [])].some(
        sourceSgSystemId =>
          sourceSgSystemId !== sgSystemId && cone.has(sourceSgSystemId),
      );
      return !hasIncomingConeEdge;
    });

    context.cones = {
      sgSystemIds: cone,
      rootSgs: new Set(rootSystemIds),
    };
    return Result.ok();
  }
}
