/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueFact} from '../../../../domain/issues/issue-fact.js';
import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';

export class ResponseBuilderPhase {
  run(context: RoutingContext, groupId: string): Result<void, IssueFact> {
    context.routingOutcome = createEmptyRoutingOutcome(
      groupId,
      context.emittedUcChanges,
    );
    return Result.ok();
  }
}
