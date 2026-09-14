/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';
import {MdfClassificationService} from '../services/mdf-classification.service.js';

export class KvResolutionService implements RoutingPhase {
  constructor(
    private readonly mdfClassificationService: MdfClassificationService,
  ) {}

  async run(
    context: RoutingContext,
    uow: UnitOfWork,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    const mdfSubgraphSystemIds = await this.mdfClassificationService.classify(
      [...context.input.effectiveRoutingScope],
      uow,
    );
    context.mdfSubgraphSystemIds.clear();
    for (const subgraphSystemId of mdfSubgraphSystemIds) {
      context.mdfSubgraphSystemIds.add(subgraphSystemId);
    }
    return Result.ok();
  }
}
