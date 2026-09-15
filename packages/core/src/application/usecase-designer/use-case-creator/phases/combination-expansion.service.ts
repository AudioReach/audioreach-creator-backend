/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';
import type {RoutingCombination} from '../contracts/routing-state.js';

export class CombinationExpansionService implements RoutingPhase {
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder phase retains its async contract.
  async run(
    context: RoutingContext,
    _uow: UnitOfWork,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    if (context.input.mode !== ROUTING_MODE.Manual) {
      return Result.ok();
    }

    let candidates: RoutingCombination[] = [
      {subgraphSystemIds: [], valueSystemIds: []},
    ];
    for (const selection of context.input.activeSubgraphs) {
      const next: RoutingCombination[] = [];
      for (const candidate of candidates) {
        for (const valueSystemIds of selection.sgkvs) {
          next.push({
            subgraphSystemIds: [
              ...candidate.subgraphSystemIds,
              selection.systemId,
            ],
            valueSystemIds: [...candidate.valueSystemIds, ...valueSystemIds],
          });
        }
      }
      candidates = next;
    }
    context.routingCombinations.push(...candidates);
    return Result.ok();
  }
}
