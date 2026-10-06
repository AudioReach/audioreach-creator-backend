/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';

export class ResponseBuilderPhase {
  run(context: RoutingContext, groupId: string): Result<void> {
    context.routingOutcome = createEmptyRoutingOutcome(
      groupId,
      context.emittedUcChanges,
      context.warnings,
    );
    return Result.ok();
  }
}
