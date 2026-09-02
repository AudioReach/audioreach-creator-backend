/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';

export class ResponseBuilder implements RoutingPhase {
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder phase retains its async contract.
  async run(
    context: RoutingContext,
    uow: UnitOfWork,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    context.response = createEmptyRoutingOutcome(
      uow.getWriteContext().groupId,
      context.warnings,
    );
    return Result.ok();
  }
}
