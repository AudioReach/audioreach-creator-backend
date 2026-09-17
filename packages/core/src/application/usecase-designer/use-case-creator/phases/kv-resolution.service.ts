/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';

export class KvResolutionService implements RoutingPhase {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase 4 behavior is owned by its existing feature plan.
  async run(
    _context: RoutingContext,
    _uow: UnitOfWork,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    return Result.ok();
  }
}
