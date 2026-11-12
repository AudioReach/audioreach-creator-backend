/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import type {
  RoutingCommandOutcome,
  RoutingOutcome,
} from '../contracts/routing-outcome.js';

/**
 * Reads the change details for the emitted changes inside the open
 * transaction. Call before commit: if the read throws, the caller rolls
 * back so the client never gets accepted work it cannot see.
 */
export async function attachChangeDetails(
  uow: UnitOfWork,
  fileSystemId: number,
  result: Exclude<Result<RoutingOutcome>, {kind: typeof RESULT_KIND.Fail}>,
): Promise<Result<RoutingCommandOutcome>> {
  const changes = await uow
    .getUsecaseRepository()
    .findUseCaseChangeDetails(fileSystemId, result.data.emittedChanges);
  return {...result, data: {...result.data, changes}};
}
