/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../issues/issue.js';
import type {SucceededResult} from '../../../issues/render-or-throw.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {
  RoutingCommandOutcome,
  RoutingOutcome,
} from '../contracts/routing-outcome.js';

/**
 * Reads the change details for the emitted changes inside the open
 * transaction and pairs them with the rendered warnings. Call before
 * commit: if the read throws, the caller rolls back so the client never
 * gets accepted work it cannot see.
 */
export async function attachChangeDetails(
  uow: UnitOfWork,
  fileSystemId: number,
  result: SucceededResult<RoutingOutcome, Issue>,
): Promise<RoutingCommandOutcome> {
  const changes = await uow
    .getUsecaseRepository()
    .findUseCaseChangeDetails(fileSystemId, result.data.emittedChanges);
  return {
    changes,
    issues: result.issues ?? [],
    groupId: result.data.groupId,
  };
}
