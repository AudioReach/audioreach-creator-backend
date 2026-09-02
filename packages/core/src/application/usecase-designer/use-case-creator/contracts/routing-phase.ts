/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {RoutingContext} from './routing-context.js';

export interface RoutingPhase {
  run(context: RoutingContext, uow: UnitOfWork): Promise<Result<void>>;
}
