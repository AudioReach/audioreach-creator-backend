/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  DiscardChangesPort,
  DiscardChangesResult,
  ISessionRepository,
  WriteContext,
} from '@arc/core';

/**
 * Deletes the complete edit-action set for the active session. The caller's
 * UnitOfWork owns the transaction; this service only performs the persistence
 * operation on that transaction-bound repository.
 */
export class TypeOrmDiscardChangesService implements DiscardChangesPort {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async discard(): Promise<DiscardChangesResult> {
    const sessionId = this.writeContext.session.sessionId;
    const discardedEditActionCount =
      await this.sessionRepository.deleteAllEditActions(sessionId);

    return {discardedEditActionCount};
  }
}
